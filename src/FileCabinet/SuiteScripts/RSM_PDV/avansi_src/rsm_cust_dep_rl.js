/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Back-end functionality which generates pdf customer deposit pdf invoice and sends it via E-mail
 *
 */
define(['N/record', 'N/render', 'N/config', 'N/runtime', 'N/file', 'N/url', 'N/email', 'N/log', './dateUtil.js', 'N/query', 'N/search'],
  function (record, render, config, runtime, file, url, email, log, dateUtil, query, search) {

    var dUtil = dateUtil.dateUtil;
    var message = null;
    var CURRENCIES = ['EUR', 'USD', 'CHF']; // foreign currencies in netsuite

    function getEmailStatusId(name) {

      var emailStatusQuery = query.runSuiteQL({
        query: 'SELECT id, name FROM customlist_rsm_email_schedule_status',
      });
      var results = emailStatusQuery.asMappedResults();
      for (var i = 0; i < results.length; i++) {
        if (results[i]['name'] === name) {
          return results[i]['id'];
        }
      }
    }

    function getReplyToEmail(subsidiaryConfig) {
      var replyToEmail = subsidiaryConfig.getValue({
        fieldId: 'custrecord_rsm_config_email_replyto'
      });
      return replyToEmail;
    }

    /**
     * Formats the currency value to incluce comma sign/signs (eg. 1,000)
     * @param {string} value input value
     * @returns {string} formated value
     */
    function formatCurrency(value) {
      if (!value && value === '' && value === ' ') {
        return value;
      }
      var sign = '', decimalPart = '';
      try {
        sign = value.match(/\-/g)[0];
        value = value.replace(sign, '');
      } catch (error) {
      }
      try {
        decimalPart = value.match(/\..+/g)[0];
        value = value.replace(decimalPart, '');
      } catch (error) {
      }
      var newValue = '';
      for (var i = value.length - 1, j = 0; i >= 0; i--, j++) {
        if (j % 3 == 0) {
          newValue = newValue !== '' ? ',' + newValue : newValue;
          newValue = value[i] + newValue;
        } else {
          newValue = value[i] + newValue;
        }
      }
      return sign + newValue + decimalPart;
    }
    function getSOData(transactionRecord) {
      var salesOrderId = transactionRecord.getValue({
        fieldId: 'salesorder'
      });
      var soData = [];
      if (salesOrderId) {
        var soRecord = record.load({
          type: record.Type.SALES_ORDER,
          id: salesOrderId,
        });
        var lineCount = soRecord.getLineCount({
          sublistId: 'item'
        });
        for (var i = 0; i < lineCount; i++) {
          var soDescription = soRecord.getSublistText({
            sublistId: 'item',
            fieldId: 'description',
            line: i
          });
          var soItem = soRecord.getSublistText({
            sublistId: 'item',
            fieldId: 'item',
            line: i
          });
          var soQuantity = soRecord.getSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            line: i
          });
          var data = {
            soItem: soItem,
            soDescription: soDescription,
            soQuantity: soQuantity
          }
          soData.push(data);
        }
      }
      return soData;
    }

    // /**
    //  * Returns date string suitable for document
    //  * @param {string} dateString
    //  * @returns {string} formatted date string
    //  */
    // function formatDate(dateString) {
    //   var dateObj = new Date(dateString);
    //   var date = dateObj.getDate(),
    //     month = dateObj.getMonth() + 1,
    //     year = dateObj.getFullYear();

    //   date = (date < 10) ? "0" + date : date;
    //   month = (month < 10) ? "0" + month : month;

    //   return date + "-" + month + "-" + year;
    // }

    /**
     * Returns email address from customer record
     * @param {record.record} customer customer record object
     * @param {string} tranLocation location from transaction form
     * @returns {string} email address
     */
    function getEmailFromCustomer(customer, tranLocation) {
      var recipientEmail = null;
      // Try to get email from contacts sublist
      var lineCount = customer.getLineCount('contactroles');
      for (var i = 0; i < lineCount; i++) {
        var contactId = customer.getSublistValue({
          sublistId: 'contactroles',
          fieldId: 'contact',
          line: i
        });
        var contactRec = record.load({
          type: record.Type.CONTACT,
          id: contactId
        });
        var locations = contactRec.getText({
          fieldId: 'custentity_contact_location'
        });

        for (var j in locations) {
          var loc = locations[j].trim();
          if (loc === tranLocation) {
            recipientEmail = customer.getSublistValue({
              sublistId: 'contactroles',
              fieldId: 'email',
              line: i
            });
            break;
          }
        }
      }

      // Else
      if (!recipientEmail) {
        recipientEmail = customer.getValue('email');
      }

      return recipientEmail;
    }

    function getWebsiteClass(transactionRecord) {
      var currentClass = transactionRecord.getText({
        fieldId: 'class'
      });
      var websiteClass = '';

      if (currentClass.indexOf('https://') !== -1 || currentClass.indexOf('http://') !== -1 ||
        currentClass.indexOf('www.') !== -1 || currentClass.indexOf('.rs') !== -1 ||
        currentClass.indexOf('.com') !== -1 || currentClass.indexOf('.info') !== -1) {
        websiteClass = currentClass;
        return websiteClass;
      } else {
        return websiteClass;
      }
    }

    function getLogoForEmail(transactionRecord) {
      var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
        feature: 'SUBSIDIARIES'
      });
      var logoUrl = '';
      if (subsidiaryFeatureCheck) {
        var subsidiaryId = transactionRecord.getValue({
          fieldId: 'subsidiary'
        });
        var subsidiaryRec = record.load({
          type: record.Type.SUBSIDIARY,
          id: subsidiaryId
        });
        logoUrl = getLogoUrl({
          transactionRecord: transactionRecord,
          subsidiaryFeatureCheck: subsidiaryFeatureCheck,
          subsidiary: subsidiaryRec
        });
      } else {
        var companyInfo = config.load({
          type: config.Type.COMPANY_INFORMATION
        });
        logoUrl = getLogoUrl({
          transactionRecord: transactionRecord,
          subsidiaryFeatureCheck: subsidiaryFeatureCheck,
          companyInfo: companyInfo
        });
      }
      return logoUrl;
    }

    function getEmailSender(transactionRecord) {

      // PROVERITI SUBSIDIARY FEATURE
      var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
        feature: 'SUBSIDIARIES'
      });
      var senderId;
      if (!subsidiaryFeatureCheck) { // RSM
        var fakturistaId = transactionRecord.getValue({
          fieldId: 'custbody_rsm_infs_fakturista'
        });
        if (fakturistaId) { // AKO JE POPUNJENO FAKTURISTA POLJE
          senderId = fakturistaId;
          return senderId;
        } else { // ULOGOVANI KORISNIK
          var user = runtime.getCurrentUser();
          var senderId = user.id;
          return senderId;
        }
      } else { // INFOSTUD
        var subsidiaryId = transactionRecord.getValue({
          fieldId: 'subsidiary'
        });
        var configRecord = getConfigRecord(subsidiaryId);

        var virtualBoolean, locationBoolean, loginBoolean;

        virtualBoolean = configRecord.getValue({
          fieldId: 'custrecord_rsm_config_email_virtual'
        });
        locationBoolean = configRecord.getValue({
          fieldId: 'custrecord_rsm_config_email_location'
        });
        loginBoolean = configRecord.getValue({
          fieldId: 'custrecord_rsm_config_email_login'
        });

        if (virtualBoolean) {
          var configVirtualEmployeeId = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_email_employee'
          });
          senderId = configVirtualEmployeeId;
          return senderId;
        }
        if (locationBoolean) {
          var locationId = transactionRecord.getValue({
            fieldId: 'location'
          });
          var locationRecord = record.load({
            type: record.Type.LOCATION,
            id: locationId
          });
          var emailAuthorId = locationRecord.getValue({
            fieldId: 'custrecord_rsm_location_email_author'
          });
          if (emailAuthorId) {
            senderId = emailAuthorId;
            return senderId;
          }
        }
        if (loginBoolean) {
          var user = runtime.getCurrentUser();
          var senderId = user.id;
          return senderId;
        }
        var user = runtime.getCurrentUser();
        var senderId = user.id;
        return senderId;
      }
    }

    function getSignatureUser(transactionRecord) {
      var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
        feature: 'SUBSIDIARIES'
      });
      if (!subsidiaryFeatureCheck) { // RSM
        var fakturistaId = transactionRecord.getValue({
          fieldId: 'custbody_rsm_infs_fakturista'
        });
        if (fakturistaId) { // AKO JE POPUNJENO FAKTURISTA POLJE
          var fakturistaLookup = search.lookupFields({
            type: search.Type.EMPLOYEE,
            id: fakturistaId,
            columns: ['entityid', 'mobilephone', 'email']
          });
          var userName = fakturistaLookup.entityid;
          var userEmail = fakturistaLookup.email;
          var userPhoneNumber = fakturistaLookup.mobilephone;
          var signatureData = [];
          signatureData.push(userName);
          signatureData.push(userEmail);
          signatureData.push(userPhoneNumber);
          return signatureData;
        } else {
          var loggedInUser = runtime.getCurrentUser();
          var loggedInUserId = loggedInUser.id;
          var loggedInLookup = search.lookupFields({
            type: search.Type.EMPLOYEE,
            id: loggedInUserId,
            columns: ['entityid', 'mobilephone', 'email']
          });
          var userName = loggedInLookup.entityid;
          var userEmail = loggedInLookup.email;
          var userPhoneNumber = loggedInLookup.mobilephone;
          var signatureData = [];
          signatureData.push(userName);
          signatureData.push(userEmail);
          signatureData.push(userPhoneNumber);
          return signatureData;
        }
      } else { // INFOSTUD
        var employeeRepId = transactionRecord.getValue({
          fieldId: 'custbody_rsm_infs_representative'
        });
        if (employeeRepId) {
          var employeeRepLookup = search.lookupFields({
            type: search.Type.EMPLOYEE,
            id: employeeRepId,
            columns: ['entityid', 'mobilephone', 'email']
          });
          var userName = employeeRepLookup.entityid;
          var userEmail = employeeRepLookup.email;
          var userPhoneNumber = employeeRepLookup.mobilephone;
          var signatureData = [];
          signatureData.push(userName);
          signatureData.push(userEmail);
          signatureData.push(userPhoneNumber);
          return signatureData;
        } else {
          var loggedInUser = runtime.getCurrentUser();
          var loggedInUserId = loggedInUser.id;
          var loggedInLookup = search.lookupFields({
            type: search.Type.EMPLOYEE,
            id: loggedInUserId,
            columns: ['entityid', 'mobilephone', 'email']
          });
          var userName = loggedInLookup.entityid;
          var userEmail = loggedInLookup.email;
          var userPhoneNumber = loggedInLookup.mobilephone;
          var signatureData = [];
          signatureData.push(userName);
          signatureData.push(userEmail);
          signatureData.push(userPhoneNumber);
          return signatureData;
        }
      }
    }

    function getAddressForEmailBody(transactionRecord) {
      var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
        feature: 'SUBSIDIARIES'
      });
      var companyName = '';
      var address = '';
      var dataArray = [];
      if (subsidiaryFeatureCheck) {
        var subsidiaryId = transactionRecord.getValue({
          fieldId: 'subsidiary'
        });
        var configRecord = getConfigRecord(subsidiaryId);

        var locationBoolean, subsidiaryBoolean;

        locationBoolean = configRecord.getValue({
          fieldId: 'custrecord_rsm_config_address_from_loc'
        });
        subsidiaryBoolean = configRecord.getValue({
          fieldId: 'custrecord_rsm_config_address_from_sub'
        });
        if (locationBoolean) {
          var locationId = transactionRecord.getValue({
            fieldId: 'location'
          });
          var locationRecord = record.load({
            type: record.Type.LOCATION,
            id: locationId
          });
          companyName = locationRecord.getValue({
            fieldId: 'name'
          });

          var addrSubRec = locationRecord.getSubrecord('mainaddress');
          var city = addrSubRec.getValue({
            fieldId: 'city'
          });
          var country = addrSubRec.getText({
            fieldId: 'country'
          });
          var zip = addrSubRec.getValue({
            fieldId: 'zip'
          });
          var streetAndNumber = addrSubRec.getValue({
            fieldId: 'addr1'
          });

          address = streetAndNumber + ', ' + zip + ' ' + city + ', ' + country;

          dataArray.push(companyName);
          dataArray.push(address);
          return dataArray;

        } else if (subsidiaryBoolean) {
          var subsidiaryRecord = record.load({
            type: record.Type.SUBSIDIARY,
            id: subsidiaryId
          });
          companyName = subsidiaryRecord.getValue({
            fieldId: 'name'
          });
          var mainAddressSubrecord = subsidiaryRecord.getSubrecord('mainaddress');
          var zip = mainAddressSubrecord.getValue({
            fieldId: 'zip'
          });
          var streetAndNumber = mainAddressSubrecord.getText({
            fieldId: 'addr1'
          });
          var country = mainAddressSubrecord.getText({
            fieldId: 'country'
          });
          var city = mainAddressSubrecord.getText({
            fieldId: 'city'
          });
          address = streetAndNumber + ', ' + zip + ' ' + city + ', ' + country;
          dataArray.push(companyName);
          dataArray.push(address);
          return dataArray;
        }
      }
      dataArray.push(companyName);
      dataArray.push(address);
      return dataArray;
    }

    function getNotificationParamObj(locationId, transactionCustomerId) {
      var notificationParamQuery = query.runSuiteQL({
        query: 'SELECT custrecord_rsm_custnp_mailto, custrecord_rsm_custnp_mailcc, custrecord_rsm_custnp_location FROM customrecord_rsm_cust_notif_param WHERE custrecord_rsm_custnp_customer =?',
        params: [transactionCustomerId]
      });

      var obj = {};
      if (!notificationParamQuery.results) {
        return obj;
      } else {
        for (var i = 0; i < notificationParamQuery.results.length; i++) {
          var allValues = notificationParamQuery.results[i].values;
          var mailTo = allValues[0];
          var mailCC = allValues[1];
          var locationsString = allValues[2];

          var mailCCArray = [];
          if (mailCC) {
            var mailCCArraySplit = mailCC.split(";");
            mailCCArraySplit.forEach(function (item) {
              mailCCArray.push(item.trim());
            });
          }
          var locationArraySplit = locationsString.split(",");
          var locationsArray = [];
          locationArraySplit.forEach(function (item) {
            locationsArray.push(parseInt(item));
          });

          obj[i] = {
            "mailTo": mailTo,
            "ccEmails": mailCCArray,
            "locations": locationsArray
          }
        }
        for (var iterator in obj) {
          for (var j = 0; j < obj[iterator]["locations"].length; j++) {
            if (obj[iterator]["locations"][j] == locationId) {
              var returnObject = {};
              returnObject.mailTo = obj[iterator]["mailTo"];
              returnObject.ccEmails = obj[iterator]["ccEmails"];
              return returnObject;
            }
          }
        }
        return null;
      }
    }

    function getConfigRecord(subsidiaryId) {
      var configQuery = query.runSuiteQL({
        query: "SELECT id FROM customrecord_rsm_subsidiary_config WHERE custrecord_rsm_config_subsidiary = ?",
        params: [subsidiaryId]
      });

      var configId = configQuery.results[0].values[0];

      var configRecord = record.load({
        type: 'customrecord_rsm_subsidiary_config',
        id: configId,
        isDynamic: true
      });

      return configRecord;
    }

    function getConfigRecordWithoutSubsidiaryFeature() {
      var configQuery = query.runSuiteQL({
        query: 'SELECT id FROM customrecord_rsm_subsidiary_config'
      });

      var configId = configQuery.results[0].values[0];

      var configRecord = record.load({
        type: 'customrecord_rsm_subsidiary_config',
        id: configId,
        isDynamic: true
      });

      return configRecord;
    }

    /**
     * Loads logoUrl dynamically
     * params.transactionRecord {object} - Current transaction record
     * params.subsidiaryFeatureCheck {boolean} - Boolean value that shows if subsidiary feature is on or off
     * params.subsidiary {object} - Subsidiary object
     * params.companyInfo {object} - Company information config object
     */
    function getLogoUrl(params) {
      var locationId = params.transactionRecord.getValue({
        fieldId: 'location'
      });
      var logoUrl = '';
      if (params.subsidiaryFeatureCheck) {  //IF SUBSIDIARY FEATURE IS ON
        if (locationId) { // IF LOCATION ON TRANSACTION BODY FIELD EXISTS
          var locationRecord = record.load({
            type: record.Type.LOCATION,
            id: locationId
          });
          var logoFileId = locationRecord.getValue({
            fieldId: 'logo'
          });
          if (logoFileId) {  // IF LOCATION RECORD HAS LOGO
            logoUrl = file.load({
              id: logoFileId
            }).url;
            return logoUrl;
          } else {  // IF THERE IS NO LOGO INSIDE LOCATION RECORD, GET LOGO FROM SUBSIDIARY
            var logoIdSubsidiary = params.subsidiary.getValue({
              fieldId: 'logo'
            });
            if (logoIdSubsidiary) { // IF SUBSIDIARY HAS LOGO, LOAD IT
              logoUrl = file.load({
                id: logoIdSubsidiary
              }).url;
              return logoUrl;
            }
          }
        } else {  // IF THERE IS NO LOCATION ON TRANSACTION BODY FIELD, LOAD LOGO FROM SUBSIDIARY
          var logoIdSubsidiary = params.subsidiary.getValue({
            fieldId: 'logo'
          });
          if (logoIdSubsidiary) {
            logoUrl = file.load({
              id: logoIdSubsidiary
            }).url;
            return logoUrl;
          }
        }
      } else { // IF SUBSIDIARY FEATURE IS OFF
        if (locationId) { // IF LOCATION ON TRANSACTION BODY FIELD EXISTS
          var locationRecord = record.load({
            type: record.Type.LOCATION,
            id: locationId
          });
          var logoFileId = locationRecord.getValue({
            fieldId: 'logo'
          });
          if (logoFileId) {  // IF LOCATION RECORD HAS LOGO
            logoUrl = file.load({
              id: logoFileId
            }).url;
            return logoUrl;
          } else {  // IF THERE IS NO LOGO INSIDE LOCATION RECORD, GET LOGO FROM COMPANY INFORMATION CONFIG
            var logoIdCompanyInfo = params.companyInfo.getValue({
              fieldId: 'formlogo'
            });
            if (logoIdCompanyInfo) { // IF COMPANY INFORMATION CONFIG HAS LOGO, LOAD IT
              logoUrl = file.load({
                id: logoIdCompanyInfo
              }).url;
              return logoUrl;
            }
          }
        } else { // IF THERE IS NO LOCATION ON TRANSACTON BODY FIELD, LOAD LOGO FROM COMPANY INFORMATION CONFIG
          var logoIdCompanyInfo = params.companyInfo.getValue({
            fieldId: 'formlogo'
          });
          if (logoIdCompanyInfo) {
            logoUrl = file.load({
              id: logoIdCompanyInfo
            }).url;
            return logoUrl;
          }
        }
      }
      return logoUrl;
    }

    function getPhoneForPrintout(subsidiaryRecord, locationRecord) {
      var locationSubrecord = locationRecord.getSubrecord('mainaddress');
      var phone = locationSubrecord.getValue('addrphone');
      if (phone) {
        return phone;
      } else {
        phone = subsidiaryRecord.getValue('fax');
        return phone;
      }
    }

    function getWebsiteForPrintout(subsidiaryRecord, locationRecord) {
      var website = locationRecord.getValue('custrecord_rsm_weburl_location');
      if (website) {
        return website;
      } else {
        website = subsidiaryRecord.getValue('url');
        return website;
      }
    }

    function getEmailForPrintout(subsidiaryRecord, locationRecord) {
      var email = locationRecord.getValue('custrecord_rsm_email_za_print');
      if (email) {
        return email
      } else {
        email = subsidiaryRecord.getValue('email');
        return email;
      }
    }

    function post(requestBody) {
      // Get current user and user's data
      var user = runtime.getCurrentUser();
      var userName = user.name;
      var userId = user.id;
      var userEmail = user.email;

      if (requestBody.action === 'createpdf') {
        try {
          var customerId = requestBody.customer;
          var customerRec = record.load({
            type: record.Type.CUSTOMER,
            id: customerId
          });
          var custDepRec = record.load({
            type: record.Type.CUSTOMER_DEPOSIT,
            id: requestBody.custDepId
          });

          var amount = parseFloat(requestBody.amount);
          var taxAmount = parseFloat(requestBody.taxAmount);
          var netAmount = amount - taxAmount;
          var amountIno = 0;
          var taxAmountIno = 0;
          var netAmountIno = 0;
          var amountRsd = 0;
          var taxAmountRsd = 0;
          var netAmountRsd = 0;

          var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
            feature: 'SUBSIDIARIES'
          });

          // Get logo from subsidiary first. If it doesn't exist, get logo from company information
          // Get other company information also
          var domain, logoUrl, companyName, address, city, country, phone, emailUrl, webSite, accountNumber, pib, maticniBroj, zip;
          if (subsidiaryFeatureCheck) {
            var subsidiaryId = custDepRec.getValue({
              fieldId: 'subsidiary'
            });
            var configRecord = getConfigRecord(subsidiaryId);

            var subsidiaryRec = record.load({
              type: record.Type.SUBSIDIARY,
              id: subsidiaryId
            });

            var locationId = custDepRec.getValue({
              fieldId: 'location'
            });
            var locationRecord = record.load({
              type: record.Type.LOCATION,
              id: locationId
            });
            logoUrl = getLogoUrl({
              transactionRecord: custDepRec,
              subsidiaryFeatureCheck: subsidiaryFeatureCheck,
              subsidiary: subsidiaryRec
            });
            domain = url.resolveDomain({
              hostType: url.HostType.APPLICATION
            });
            companyName = subsidiaryRec.getValue({
              fieldId: 'legalname'
            });
            var addrSubRec = locationRecord.getSubrecord('mainaddress');
            var subsidiaryMainAddress = subsidiaryRec.getSubrecord('mainaddress');
            address = subsidiaryMainAddress.getValue({
              fieldId: 'addr1'
            });
            city = subsidiaryMainAddress.getValue({
              fieldId: 'city'
            });
            country = subsidiaryMainAddress.getValue({
              fieldId: 'country'
            });
            phone = getPhoneForPrintout(subsidiaryRec, locationRecord);
            emailUrl = getEmailForPrintout(subsidiaryRec, locationRecord);
            webSite = getWebsiteForPrintout(subsidiaryRec, locationRecord);
            zip = subsidiaryMainAddress.getValue('zip');
            accountNumber = '';
            pib = subsidiaryRec.getValue({
              fieldId: 'federalidnumber'
            });
            maticniBroj = subsidiaryRec.getValue({
              fieldId: 'custrecord_subs_mat_broj'
            });
          } else {
            accountNumber = '';
            try {
              var companyInfo = config.load({
                type: config.Type.COMPANY_INFORMATION
              });
              logoUrl = getLogoUrl({
                transactionRecord: custDepRec,
                subsidiaryFeatureCheck: subsidiaryFeatureCheck,
                companyInfo: companyInfo
              });
              domain = url.resolveDomain({
                hostType: url.HostType.APPLICATION
              });
              companyName = companyInfo.getValue({
                fieldId: 'companyname'
              });
              address = companyInfo.getValue({
                fieldId: 'mainaddress _text'
              });
              phone = companyInfo.getValue({
                fieldId: 'fax'
              });
              emailUrl = companyInfo.getValue({
                fieldId: 'email'
              });
              webSite = companyInfo.getValue({
                fieldId: 'url'
              });
              pib = companyInfo.getValue({
                fieldId: 'employerid'
              });
              maticniBroj = companyInfo.getValue({
                fieldId: 'custrecord_rsm_mat_br_komp'
              });

            } catch (error) {
              logoUrl = '';
              domain = '';
              companyName = '';
              address = '';
              city = '';
              country = '';
              phone = '';
              emailUrl = '';
              webSite = '';
              zip = '';
              pib = '';
              maticniBroj = '';
              log.error('Error', "Couldn't get company information data! Error message:\n" + error);
            }
          }

          var napomenaOPoreskomOslobadjanju = '',
            mestoIzdavanjaFakture = '',
            napomenaZaPrint = '';
          try {
            mestoIzdavanjaFakture = custDepRec.getValue({
              fieldId: 'custbody_mestoizdavanjafakture'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_mestoizdavanjafakture'");
          }
          try {
            napomenaOPoreskomOslobadjanju = custDepRec.getValue({
              fieldId: 'custbody_napomenaporezoslobodjen'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_napomenaporezoslobodjen'");
          }
          try {
            napomenaZaPrint = custDepRec.getValue({
              fieldId: 'custbody_rsm_napomena_za_print'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_rsm_napomena_za_print'");
          }

          // Get address details from customer
          var custAddress = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'addr1_initialvalue',
            line: 0
          });
          var custCity = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'city_initialvalue',
            line: 0
          });
          var custCountry = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'country_initialvalue',
            line: 0
          });
          // Check currency here and convert cust dep amounts if it's EUR and customer country is Serbia
          // var currency = custDepRec.getText('currency');
          var currencyRec = record.load({
            type: record.Type.CURRENCY,
            id: custDepRec.getValue('currency')
          });
          var currency = currencyRec.getValue('symbol');
          var currencyDisplaySymbol = currencyRec.getValue('displaysymbol');
          var currencyAppend = (currencyDisplaySymbol) ? currencyDisplaySymbol : currency;

          var exchangeRate = custDepRec.getValue('exchangerate');
          if (currency !== 'RSD' && (custCountry === 'RS' || custCountry === 'Serbia')) {
            amountIno = amount;
            amount *= exchangeRate;
            taxAmountIno = taxAmount / exchangeRate;
            netAmountIno = amountIno - taxAmountIno;
          } else if (currency !== 'RSD' && (!(custCountry === 'RS' || custCountry === 'Serbia'))) {
            amountRsd = amount * exchangeRate;
            taxAmountRsd = taxAmount;
            taxAmount /= exchangeRate;
            netAmountRsd = amountRsd - taxAmountRsd;
          } else {
            taxAmount /= exchangeRate;
          }
          netAmount = amount - taxAmount;

          custCountry = (custCountry === 'RS') ? '' : custCountry;
          var custZip = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'zip_initialvalue',
            line: 0
          });
          var isIndividualValue = customerRec.getValue({
            fieldId: 'isperson'
          });
          var isIndividual = (isIndividualValue === 'F') ? false : true;
          var soDocumentNumber = '';
          var soFullDocNumber = custDepRec.getText('salesorder')
          if (soFullDocNumber !== '') {
            var splitArray = soFullDocNumber.split(' ');
            soDocumentNumber = splitArray[2];
          }
          var soData = getSOData(custDepRec);

          var data = {
            tranId: requestBody.tranId,
            tranDate: dUtil.getDateFromFormattedDate(requestBody.tranDate),
            taxRate: requestBody.taxRate,
            grossAmount: formatCurrency(amount.toFixed(2)),
            taxAmount: formatCurrency(taxAmount.toFixed(2)),
            netAmount: formatCurrency(netAmount.toFixed(2)),
            grossAmountIno: (amountIno != 0) ? '(' + formatCurrency(amountIno.toFixed(2)) + currencyAppend + ')' : '',
            taxAmountIno: (taxAmountIno != 0) ? '(' + formatCurrency(taxAmountIno.toFixed(2)) + currencyAppend + ')' : '',
            netAmountIno: (netAmountIno != 0) ? '(' + formatCurrency(netAmountIno.toFixed(2)) + currencyAppend + ')' : '',
            grossAmountRsd: (amountRsd != 0) ? '(' + formatCurrency(amountRsd.toFixed(2)) + 'RSD)' : '',
            taxAmountRsd: (taxAmountRsd != 0) ? '(' + formatCurrency(taxAmountRsd.toFixed(2)) + 'RSD)' : '',
            netAmountRsd: (netAmountRsd != 0) ? '(' + formatCurrency(netAmountRsd.toFixed(2)) + 'RSD)' : '',
            salesOrder: requestBody.salesOrder,
            memo: requestBody.memo,
            location: requestBody.location,
            napomenaOPoreskomOslobadjanju: napomenaOPoreskomOslobadjanju, // im not sure if these fields exist in cust-dep
            napomenaZaPrint: napomenaZaPrint,
            mestoIzdavanjaFakture: mestoIzdavanjaFakture, // im not sure if these fields exist in cust-dep
            brojUgovora: custDepRec.getValue('custbody_rsm_br_ugovora'),
            currency: currency,
            transactionCurrency: currency,
            orderNum: custDepRec.getValue('custbody_rsm_crm_ordernum'),
            soDocumentNumber: soDocumentNumber,
            soData: soData,

            user: {
              name: userName,
              id: userId
            },

            companyInformation: {
              name: companyName,
              address: address,
              city: city,
              country: (country === 'RS') ? 'Srbija' : country,
              zip: zip,
              phone: phone,
              email: emailUrl,
              webSite: webSite,
              accountNumber: accountNumber,
              pib: pib,
              maticniBroj: maticniBroj,
              logoUrl: 'https://' + domain + logoUrl.replace(/&/g, '&amp;'),
            },

            customer: {
              id: customerRec.getValue('entityid'),
              companyName: customerRec.getValue('companyname'),
              pib: customerRec.getValue('custentity_pib'),
              maticniBroj: customerRec.getValue('custentity_matbrpred'),
              address: customerRec.getValue('defaultaddress'),
              isIndividual: isIndividual,
              addrDetails: {
                addrText: custAddress,
                city: custCity,
                country: (custCountry === 'RS') ? 'Srbija' : custCountry,
                zip: custZip
              }
            },

            items: []
          };
          var renderer = render.create();

          renderer.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias: "JSON",
            data: data
          });
          var configRecord;
          if (subsidiaryFeatureCheck) {
            try {
              configRecord = getConfigRecord(subsidiaryId);
            } catch (error) {
              log.error('Error', "Error message: " + error);
              message = {
                type: 'error',
                title: 'Greska!',
                message: "Molimo vas da podesite Subsidiary Config za subsidiary sa transakcije."
              };
              return {
                message: message
              };
            }
          } else {
            configRecord = getConfigRecordWithoutSubsidiaryFeature();
          }

          if (custCountry === 'RS' || custCountry === '' || custCountry === 'ME' || custCountry === 'BA' || custCountry === 'HR') {
            var customer_deposit_pdf_rs = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_cust_dep_pdf'
            });
            if (!customer_deposit_pdf_rs) {
              log.error('Error', 'Customer deposit PDF template field is empty inside Subsidiary Config.')
              message = {
                type: 'error',
                title: 'Greska!',
                message: "Molimo vas da podesite PDF Template Fields unutar Subsidiary config-a za subsidiary sa transakcije."
              };
              return {
                message: message
              };
            }
            renderer.setTemplateByScriptId(customer_deposit_pdf_rs);
          } else {
            var customer_deposit_pdf_ino = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_cust_dep_pdf_ino'
            });
            if (!customer_deposit_pdf_ino) {
              log.error('Error', 'Customer deposit PDF template field is empty inside Subsidiary Config.')
              message = {
                type: 'error',
                title: 'Greska!',
                message: "Molimo vas da podesite PDF Template Fields unutar Subsidiary config-a za subsidiary sa transakcije."
              };
              return {
                message: message
              };
            }
            renderer.setTemplateByScriptId(customer_deposit_pdf_ino);
          }

          var pdfFile = renderer.renderAsPdf();

          // Load customer deposit record
          var custDepId = requestBody.custDepId;
          var custDepRec = record.load({
            type: record.Type.CUSTOMER_DEPOSIT,
            id: custDepId
          });
          // Delete the old pdf file if it already exists
          var olfFileId = custDepRec.getValue('custbody_cust_dep_pdf_file');
          if (olfFileId) {
            file.delete({
              id: olfFileId
            });
            log.audit('Success', 'Old pdf file deleted!');
          }

          // Save a new pdf file to file cabinet and add it to the cust dep form
          var newPdfFile = file.create({
            name: "PDF faktura - deposit:" + requestBody.custDepId,
            fileType: file.Type.PDF,
            contents: pdfFile.getContents(),
            folder: file.load({
              id: './pdf_files/flagfile'
            }).folder
          });
          var newPdfFileId = newPdfFile.save();
          log.audit('Success', "New pdf file created! ID:" + newPdfFileId);

          custDepRec.setValue({
            fieldId: 'custbody_cust_dep_pdf_file',
            value: newPdfFileId
          });
          custDepRec.save();

          message = {
            type: 'confirmation',
            title: 'Uspesno!',
            message: "PDF faktura za depozit " + requestBody.custDepId + " je uspesno kreirana! Osvezite stranicu.",
            duration: '0'
          };

        } catch (error) {
          log.error('Error', "Error message: " + error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Doslo je do greske prilikom kreiranja PDF fakture! Proverite log restlet skripte."
          };
        }
      }

      if (requestBody.action === 'emailpdf') {
        try {
          var custDepRec = record.load({
            type: record.Type.CUSTOMER_DEPOSIT,
            id: requestBody.custDepId
          });

          // Get file from customer deposit record
          var pdfFileId = custDepRec.getValue('custbody_cust_dep_pdf_file');
          if (!pdfFileId || pdfFileId === '' || pdfFileId === ' ') {
            message = {
              type: 'error',
              title: 'Greska!',
              message: "Prvo morate generisati PDF fakturu!"
            };
            return {
              message: message
            };
          }
          var pdfFile = file.load({
            id: pdfFileId
          });

          // Load customer record
          var customerRec = record.load({
            type: record.Type.CUSTOMER,
            id: custDepRec.getValue('customer')
          });

          var custCountry = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'country_initialvalue',
            line: 0
          });
          custCountry = (custCountry === 'RS') ? '' : custCountry;

          var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
            feature: 'SUBSIDIARIES'
          });
          var configRecord;
          if (subsidiaryFeatureCheck) {
            var subsidiaryId = custDepRec.getValue({
              fieldId: 'subsidiary'
            });
            try {
              configRecord = getConfigRecord(subsidiaryId);
            } catch (error) {
              log.error('Error', "Error message: " + error);
              message = {
                type: 'error',
                title: 'Greska!',
                message: "Molimo vas da podesite Subsidiary Config za subsidiary sa transakcije."
              };
              return {
                message: message
              };
            }
          } else {
            configRecord = getConfigRecordWithoutSubsidiaryFeature();
          }
          var locationText = custDepRec.getText('location');
          // Get customer email - recipient email
          var recipientEmail = getEmailFromCustomer(customerRec, locationText);
          var ccEmailArray = [];
          var bccEmailArray = [];
          var transactionLocationId = custDepRec.getValue({
            fieldId: 'location'
          });

          //var customerId = requestBody.customer;
          var transactionCustomerId = custDepRec.getValue('customer');

          var transactionCCField = custDepRec.getText('custbody_rsm_additional_cc_email');

          var transactionBCCField = custDepRec.getText('custbody_rsm_additional_bcc_email');

          if (transactionCCField !== "") {
            var tempList = transactionCCField.split(";");
            tempList.forEach(function (item) {
              ccEmailArray.push(item.trim());
            });
          }
          if (transactionBCCField !== "") {
            tempList = transactionBCCField.split(";");
            tempList.forEach(function (item) {
              bccEmailArray.push(item.trim());
            });
          }
          var notificationParams = getNotificationParamObj(transactionLocationId, transactionCustomerId);


          if (notificationParams) {
            recipientEmail = notificationParams.mailTo;
            notificationParams.ccEmails.forEach(function (email) {
              ccEmailArray.push(email);
            })
          }

          if (!recipientEmail || recipientEmail === '') {
            log.error('Error', "There is no email on customer record nor Notification param record for this customer!")
            message = {
              type: 'error',
              title: 'Greska!',
              message: "Molimo vas da podesite email polje na Customer record-u ili Notification Param record za datog customera!"
            };
            return {
              message: message
            };
          }

          var cust_dep_email_rs = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_cust_dep_email'
          });
          var cust_dep_email_ino = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_cust_dep_email_ino'
          });
          var emailTemplateId = '';

          if (custCountry === 'RS' || custCountry === '' || custCountry === 'ME' || custCountry === 'BA' || custCountry === 'HR') {
            emailTemplateId = cust_dep_email_rs
          } else {
            emailTemplateId = cust_dep_email_ino;
          }

          if (!emailTemplateId) {
            log.error('Error', "Customer deposit email template field is empty inside Subsidiary Config.")
            message = {
              type: 'error',
              title: 'Greska!',
              message: "Molimo vas da podesite EMAIL Template Fields unutar Subsidiary config-a za subsidiary sa transakcije."
            };
            return {
              message: message
            };
          }

          var emailQuery = query.runSuiteQL({
            query: "SELECT content, subject, mediaItem FROM emailtemplate WHERE scriptid = ?",
            params: [emailTemplateId]
          });

          var emailContent = emailQuery.results[0].values[0];
          var emailSubject = emailQuery.results[0].values[1];
          var mediaItemId = emailQuery.results[0].values[2];
          var content;

          if (emailContent) {
            content = emailContent
          } else {
            var file1 = file.load({
              id: mediaItemId
            });

            var emailRender = render.create();
            emailRender.templateContent = file1.getContents();

            var signatureData = getSignatureUser(custDepRec);
            var websiteClass = getWebsiteClass(custDepRec);
            var logoUrl = getLogoForEmail(custDepRec);

            var domain = url.resolveDomain({
              hostType: url.HostType.APPLICATION
            });
            var jsonObj = {
              employeeId: signatureData[0],
              employeeEmail: signatureData[1],
              employeeMobilePhone: signatureData[2],
              websiteClass: websiteClass,
              logoUrl: 'https://' + domain + logoUrl.replace(/&/g, '&amp;')
            }
            var emailSender = getEmailSender(custDepRec);

            emailRender.addCustomDataSource({
              format: render.DataSource.OBJECT,
              alias: "JSON",
              data: jsonObj
            });

            content = emailRender.renderAsString();
          }

          var replyToEmailAddress = getReplyToEmail(configRecord);
          if (replyToEmailAddress === '') {
            email.send({
              author: emailSender, // Internal id of email sender - current user
              body: content, // insert email body as a string
              recipients: recipientEmail, // email of recipient as a string - could be an array of strings also
              cc: ccEmailArray, // array of strings for cc of email
              bcc: bccEmailArray, // array of strings for bcc of email
              subject: emailSubject, // subject as a string
              attachments: [pdfFile], // insert file.File - array
              relatedRecords: {
                entityId: transactionCustomerId,
                transactionId: requestBody.custDepId
              }
            });
          } else {
            email.send({
              author: emailSender, // Internal id of email sender - current user
              body: content, // insert email body as a string
              recipients: recipientEmail, // email of recipient as a string - could be an array of strings also
              cc: ccEmailArray, // array of strings for cc of email
              bcc: bccEmailArray, // array of strings for bcc of email
              subject: emailSubject, // subject as a string
              attachments: [pdfFile], // insert file.File - array
              relatedRecords: {
                entityId: transactionCustomerId,
                transactionId: requestBody.custDepId
              },
              replyTo: replyToEmailAddress
            });
          }

          var emailStatusId = getEmailStatusId('SENT');
          custDepRec.setValue({
            fieldId: 'custbody_rsm_cd_email_status',
            value: emailStatusId
          });
          custDepRec.save();

          message = {
            type: 'confirmation',
            title: 'Uspesno',
            message: "Email sa fakturom je uspesno poslat!",
            duration: '0'
          };
        } catch (error) {
          log.error('Error', error);
          message = {
            type: 'error',
            title: 'Greska',
            message: "Slanje Email-a je neuspesno! Poruka greske: " + error,
            duration: '0'
          };
        }

      }

      // Response object
      return {
        newPdfFileId: newPdfFileId,
        message: message
      };

    }

    return {
      post: post
    };

  });
