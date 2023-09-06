/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/query', 'N/runtime', 'N/config', 'N/file', 'N/url', 'N/render', 'N/email', 'N/log', 'N/search', './dateUtil.js'],
  function (record, query, runtime, config, file, url, render, email, log, search, dateUtil) {

    var dUtil = dateUtil.dateUtil;
    var CURRENCIES = ['EUR', 'USD', 'CHF']; // foreign currencies in netsuite

    function getReplyToEmail(subsidiaryConfig) {
      var replyToEmail = subsidiaryConfig.getValue({
        fieldId: 'custrecord_rsm_config_email_replyto'
      });
      return replyToEmail;
    }

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
        // log.error('Greska u delu za format currency - sign', error);
      }
      try {
        decimalPart = value.match(/\..+/g)[0];
        value = value.replace(decimalPart, '');
      } catch (error) {
        // log.error('Greska u delu za format currency - decimal part', error);
      }

      var newValue = '';
      for (var i = value.length - 1, j = 0; i >= 0; i--, j++) {
        if (j % 3 == 0) {
          newValue = newValue !== '' ? ',' + newValue : newValue;
        }
        newValue = value[i] + newValue;
      }
      return sign + newValue + decimalPart;
    }

    /**
     * Returns email address from customer record
     * @param {record.record} customer customer record object
     * @param {string} tranLocation location from transaction form
     * @returns {string} email address
     */
    function getEmailFromCustomer(customer, tranLocation) {
      try {
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
      } catch (error) {
        log.error('Error 1', 'Error happened in getEmailFromCustomer function: ' + error);
      }
    }

    function getWebsiteClass(transactionRecord) {
      try {
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
      } catch (error) {
        log.error('Error', 'Error happend in getWebsiteFunction:' + error)
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
      try {
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
            var country = addrSubRec.getValue({
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
      } catch (error) {
        log.error('Error', 'Error happened in getAddressForEmailBody: ' + error);
      }
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

    function getBankAccountsWithSubsidiary(locationId, subsidiaryId, currencyId, bankAccounts) {

      var bankAccountsData = [];
      if (bankAccounts.toString() !== '') {
        bankAccounts = "(" + bankAccounts.toString() + ")";
        var bankAccountsQuery = query.runSuiteQL({
          query: 'SELECT custrecord_rsm_comp_ba_swift, custrecord_rsm_comp_ba_account, custrecord_rsm_comp_ba_preferred, custrecord_rsm_comp_ba_bank FROM customrecord_rsm_company_bank_accounts WHERE id IN ' + bankAccounts
        });

        bankAccountsQuery.results.forEach(function (item) {
          var obj = {};
          obj.swift = item.values[0];
          obj.iban = item.values[1];
          obj.bankName = item.values[3];
          bankAccountsData.push(obj)
        });
      } else {
        var bankAccountsQuery = query.runSuiteQL({
          query: 'SELECT custrecord_rsm_comp_ba_swift, custrecord_rsm_comp_ba_account, custrecord_rsm_comp_ba_preferred, custrecord_rsm_comp_ba_locations, custrecord_rsm_comp_ba_bank FROM customrecord_rsm_company_bank_accounts WHERE custrecord_rsm_comp_ba_currency =? AND custrecord_rsm_comp_ba_subsidiary =?',
          params: [currencyId, subsidiaryId]
        });
        var tempData = [];
        bankAccountsQuery.results.forEach(function (item) {
          var obj = {};
          obj.swift = item.values[0];
          obj.iban = item.values[1];
          obj.preferred = (item.values[2] === 'T') ? true : false;
          obj.locations = [];
          obj.bankName = item.values[4];

          var locationArraySplit = (item.values[3] != null) ? item.values[3].split(",") : [];
          locationArraySplit.forEach(function (item) {
            obj.locations.push(parseInt(item));
          });
          tempData.push(obj);
        });

        if (locationId) {
          locationId = parseInt(locationId);
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.indexOf(locationId) !== -1 && arrayItem.preferred) {
              bankAccountsData.push(arrayItem);
            }
          });
          if (bankAccountsData.length === 0) {
            tempData.forEach(function (arrayItem) {
              if (arrayItem.locations.indexOf(locationId) !== -1 && !arrayItem.preferred) {
                bankAccountsData.push(arrayItem);
              }
            });
          }
        }
        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && arrayItem.preferred) {
              bankAccountsData.push(arrayItem);
            }
          });
        }

        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && !arrayItem.preferred) {
              bankAccountsData.push(arrayItem);
            }
          })
        }
      }
      return bankAccountsData;
    }

    function getBankAccountsWithoutSubsidiary(locationId, currencyId, bankAccounts) {
      var bankAccountsData = [];
      if (bankAccounts.toString() !== '') {
        bankAccounts = "(" + bankAccounts.toString() + ")";
        var bankAccountsQuery = query.runSuiteQL({
          query: 'SELECT custrecord_rsm_comp_ba_swift, custrecord_rsm_comp_ba_account, custrecord_rsm_comp_ba_preferred, custrecord_rsm_comp_ba_bank FROM customrecord_rsm_company_bank_accounts WHERE id IN ' + bankAccounts
        });

        bankAccountsQuery.results.forEach(function (item) {
          var obj = {};
          obj.swift = item.values[0];
          obj.iban = item.values[1];
          obj.bankName = item.values[2];
          bankAccountsData.push(obj)
        });
      } else {
        var bankAccountsQuery = query.runSuiteQL({
          query: 'SELECT custrecord_rsm_comp_ba_swift, custrecord_rsm_comp_ba_account, custrecord_rsm_comp_ba_preferred, custrecord_rsm_comp_ba_locations, custrecord_rsm_comp_ba_bank FROM customrecord_rsm_company_bank_accounts WHERE custrecord_rsm_comp_ba_currency =?',
          params: [currencyId]
        });
        var tempData = [];
        bankAccountsQuery.results.forEach(function (item) {
          var obj = {};
          obj.swift = item.values[0];
          obj.iban = item.values[1];
          obj.preferred = (item.values[2] === 'T') ? true : false;
          obj.locations = [];
          obj.bankName = item.values[4];

          var locationArraySplit = (item.values[3] != null) ? item.values[3].split(",") : [];
          locationArraySplit.forEach(function (item) {
            obj.locations.push(parseInt(item));
          });
          tempData.push(obj);
        });

        if (locationId) {
          locationId = parseInt(locationId);
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.indexOf(locationId) !== -1 && arrayItem.preferred) {
              bankAccountsData.push(arrayItem);
            }
          });
          if (bankAccountsData.length === 0) {
            tempData.forEach(function (arrayItem) {
              if (arrayItem.locations.indexOf(locationId) !== -1 && !arrayItem.preferred) {
                bankAccountsData.push(arrayItem);
              }
            });
          }
        }
        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && arrayItem.preferred) {
              bankAccountsData.push(arrayItem);
            }
          });
        }

        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && !arrayItem.preferred) {
              bankAccountsData.push(arrayItem);
            }
          })
        }
      }
      return bankAccountsData;
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
      var user = runtime.getCurrentUser();
      var userName = user.name;
      var userId = user.id;
      var userEmail = user.email;

      if (requestBody.action === 'createJournal') {

        var message = {},
          recId = null,
          isCreated = false;

        var d = requestBody.data.date.split('-');
        var date = dUtil.createNewDateString(d[2], d[1], d[0]);

        try {
          // Load credit memo record
          var creditMemoRec = record.load({
            type: record.Type.CREDIT_MEMO,
            id: requestBody.data.creditMemoId
          });
          var cmTranId = creditMemoRec.getValue('tranid');
          var cmCustomer = creditMemoRec.getText('entity');
          var cmInvoice = creditMemoRec.getText('createdfrom');
          var departmentId = creditMemoRec.getValue('department');
          var classId = creditMemoRec.getValue('class');
          var locationId = creditMemoRec.getValue('location');

          var rec = record.create({
            type: record.Type.JOURNAL_ENTRY,
            isDynamic: true
          });
          // In future need to check if subsidiary exists whatsoever
          rec.setValue({
            fieldId: 'subsidiary',
            value: requestBody.data.subsidiary
          });
          // Load currency
          var currencyResultSet = query.runSuiteQL({
            query: "SELECT id, name FROM currency WHERE symbol = ?",
            params: ['RSD']
          });
          // Get the id from query result
          var currencyId = currencyResultSet.results[0].values[0];
          rec.setValue({
            fieldId: 'currency',
            value: currencyId
          });
          // Set trandate
          rec.setText({
            fieldId: 'trandate',
            text: date
          });
          // Set popdv datum field
          rec.setText({
            fieldId: 'custbody_popdv_datum',
            text: date
          });
          // Set custbody_datum_poresko_oslobodjenje
          rec.setText({
            fieldId: 'custbody_datum_poresko_oslobodjenje',
            text: date
          });
          // Set custbody_br_potvrde_poresko_oslob
          rec.setValue({
            fieldId: 'custbody_br_potvrde_poresko_oslob',
            value: requestBody.data.number
          });
          rec.setText({
            fieldId: 'memo',
            text: cmCustomer + " / C M" + cmTranId + " / " + cmInvoice
          });
          var generalPreferences = config.load({
            type: config.Type.COMPANY_PREFERENCES
          });
          var undefTaxCodeId = generalPreferences.getValue({
            fieldId: 'custscript_rsm_undef_tax_code_parameter'
          });
          var accId = generalPreferences.getValue({
            fieldId: 'custscript_rsm_pdv_za_prek_acc_par'
          });

          // Debit line
          rec.selectNewLine({
            sublistId: 'line'
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'debit',
            value: requestBody.data.netAmount
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: accId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'taxcode',
            value: requestBody.data.taxCode
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: cmCustomer + " / CM" + cmTranId + " / " + cmInvoice
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          rec.commitLine({
            sublistId: 'line'
          });

          // Credit line - Net Amount
          rec.selectNewLine({
            sublistId: 'line'
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'credit',
            value: requestBody.data.netAmount
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: accId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'taxcode',
            value: undefTaxCodeId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: cmCustomer + " / CM" + cmTranId + " / " + cmInvoice
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          rec.commitLine({
            sublistId: 'line'
          });

          // Credit line - Tax Amount
          rec.selectNewLine({
            sublistId: 'line'
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'credit',
            value: requestBody.data.taxAmount
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: requestBody.data.taxAccountId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'taxcode',
            value: undefTaxCodeId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: cmCustomer + " / CM" + cmTranId + " / " + cmInvoice
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          rec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          rec.commitLine({
            sublistId: 'line'
          });

          recId = rec.save();
          log.audit('Success', "Generated journal transaction with id: " + recId);

          // Set 'linked journal entry' field value to returned journal id in credit memo
          creditMemoRec.setValue({
            fieldId: 'custbody_linked_journal_entry',
            value: recId
          });
          // Set date
          creditMemoRec.setText({
            fieldId: 'custbody_datum_poresko_oslobodjenje',
            text: date
          });
          creditMemoRec.save();

          message = {
            type: 'confirmation',
            title: 'Confirmation',
            message: "Journal transakcija je uspesno kreirana! ID:" + recId + ". Automatsko osvezavanje stranice za 5s!",
            duration: '0'
          };
          isCreated = true;
        } catch (error) {
          log.error("Greska!", error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Greska prilikom kreiranja Journal transakcije. Error message: " + error
          };
        }

        // Response object
        return {
          isCreated: isCreated,
          journalId: recId,
          message: message
        };

      } else if (requestBody.action === 'createpdf') {
        try {
          var cmRec = record.load({
            type: record.Type.CREDIT_MEMO,
            id: requestBody.data.creditMemoId
          });
          var cmAmount = 0,
            cmTaxAmount = 0,
            cmGrossAmount = 0,
            cmAmountIno = 0,
            cmTaxAmountIno = 0,
            cmGrossAmountIno = 0,
            cmAmountRsd = 0,
            cmTaxAmountRsd = 0,
            cmGrossAmountRsd = 0;
          var customerId = cmRec.getValue('entity');
          var customerRec = record.load({
            type: record.Type.CUSTOMER,
            id: customerId
          });
          var customerCountry = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'country_initialvalue',
            line: 0
          })
          var currencyRec = record.load({
            type: record.Type.CURRENCY,
            id: cmRec.getValue('currency')
          });

          var cmCurrency = currencyRec.getValue('symbol');
          var cmCurrencyDisplaySymbol = currencyRec.getValue('displaysymbol');
          var currencyAppend = (cmCurrencyDisplaySymbol) ? cmCurrencyDisplaySymbol : cmCurrency;

          // Get items
          var lineCount = cmRec.getLineCount({
            sublistId: 'item'
          });
          var items = [], itemsTotalNetAmount = 0, itemsTotalTaxAmount = 0, itemsTotalGrossAmount = 0;
          for (var i = 0; i < lineCount; i++) {
            var amt = parseFloat(cmRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'amount',
              line: i
            }));
            var taxAmt = parseFloat(cmRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'tax1amt',
              line: i
            }));
            var amtIno = 0,
              taxAmtIno = 0,
              grsAmtIno = 0,
              amtRsd = 0,
              taxAmtRsd = 0,
              grsAmtRsd = 0;
            var exchangeRate = cmRec.getValue('exchangerate');
            if (cmCurrency !== 'RSD' && (customerCountry === 'RS' || customerCountry === 'Serbia')) {
              amtIno = amt;
              taxAmtIno = taxAmt;
              grsAmtIno = amtIno + taxAmtIno;
              cmGrossAmountIno += grsAmtIno;
              cmTaxAmountIno += taxAmtIno;
              cmAmountIno += amtIno;
              amt *= exchangeRate;
              taxAmt *= exchangeRate;
            } else if (cmCurrency !== 'RSD' && (!(customerCountry === 'RS' || customerCountry === 'Serbia'))) {
              amtRsd = amt * exchangeRate;
              taxAmtRsd = taxAmt * exchangeRate;
              grsAmtRsd = amtRsd + taxAmtRsd;
              cmAmountRsd += amtRsd;
              cmTaxAmountRsd += taxAmtRsd;
              cmGrossAmountRsd += grsAmtRsd;
            }
            var grsAmt = amt + taxAmt;
            cmGrossAmount += grsAmt;
            cmTaxAmount += taxAmt;
            cmAmount += amt;
            items.push({
              name: cmRec.getSublistText({
                sublistId: 'item',
                fieldId: 'item',
                line: i
              }),
              description: cmRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'description',
                line: i
              }),
              taxRate: cmRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'taxrate1',
                line: i
              }),
              netAmount: formatCurrency(amt.toFixed(2)),
              netAmountIno: (amtIno != 0) ? '(' + formatCurrency(amtIno.toFixed(2)) + currencyAppend + ')' : '',
              netAmountRsd: (amtRsd != 0) ? '(' + formatCurrency(amtRsd.toFixed(2)) + 'RSD)' : '',
              taxAmount: formatCurrency(taxAmt.toFixed(2)),
              taxAmountIno: (taxAmtIno != 0) ? '(' + formatCurrency(taxAmtIno.toFixed(2)) + currencyAppend + ')' : '',
              taxAmountRsd: (taxAmtRsd != 0) ? '(' + formatCurrency(taxAmtRsd.toFixed(2)) + 'RSD)' : '',
              grossAmount: formatCurrency(grsAmt.toFixed(2)),
              grossAmountIno: (grsAmtIno != 0) ? '(' + formatCurrency(grsAmtIno.toFixed(2)) + currencyAppend + ')' : '',
              grossAmountRsd: (grsAmtRsd != 0) ? '(' + formatCurrency(grsAmtRsd.toFixed(2)) + 'RSD)' : ''
            });
            itemsTotalNetAmount += amt;
            itemsTotalTaxAmount += taxAmt;
            itemsTotalGrossAmount += grsAmt;
          }

          var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
            feature: 'SUBSIDIARIES'
          });
          var cmCustomer = record.load({
            type: record.Type.CUSTOMER,
            id: cmRec.getValue('entity')
          });
          var customerCountry = cmCustomer.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'country_initialvalue',
            line: 0
          });
          var locationId = cmRec.getValue('location');
          var currencyId = cmRec.getValue('currency');
          var currencyRec = record.load({
            type: record.Type.CURRENCY,
            id: currencyId
          });
          var transactionCurrency = currencyRec.getValue('symbol');
          var bankAccounts = cmRec.getValue('custbody_rsm_trans_bank_acc');
          var bankAccountsData = [];
          if ((customerCountry !== 'Serbia' || customerCountry !== 'RS')) {
            if (subsidiaryFeatureCheck) {
              var subsidiaryId = cmRec.getValue('subsidiary');
              bankAccountsData = getBankAccountsWithSubsidiary(locationId, subsidiaryId, currencyId, bankAccounts);
            } else {
              bankAccountsData = getBankAccountsWithoutSubsidiary(locationId, currencyId, bankAccounts);
            }
          }

          // Get company information data
          // Get data from subsidiary first. If it doesn't exist, get data from company information
          var domain, logoUrl, companyName, address, phone, emailUrl, webSite, accountNumber, pib, maticniBroj, city,
            country, zip;
          if (subsidiaryFeatureCheck) {
            var subsidiaryId = cmRec.getValue({
              fieldId: 'subsidiary'
            });
            var configRecord = getConfigRecord(subsidiaryId);

            var subsidiaryRec = record.load({
              type: record.Type.SUBSIDIARY,
              id: subsidiaryId
            });

            var locationId = cmRec.getValue({
              fieldId: 'location'
            });
            var locationRecord = record.load({
              type: record.Type.LOCATION,
              id: locationId
            });
            logoUrl = getLogoUrl({
              transactionRecord: cmRec,
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
            zip = subsidiaryMainAddress.getValue({
              fieldId: 'zip'
            });
            phone = getPhoneForPrintout(subsidiaryRec, locationRecord);
            emailUrl = getEmailForPrintout(subsidiaryRec, locationRecord);
            webSite = getWebsiteForPrintout(subsidiaryRec, locationRecord);
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
                transactionRecord: cmRec,
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
                fieldId: 'mainaddress_text'
              });
              country = companyInfo.getValue({
                fieldId: 'country'
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
              pib = '';
              maticniBroj = '';
              log.error('Error', "Couldn't get company information data! Error message:\n" + error);
            }
          }

          try {
            // Get customer data
            var customerRec = record.load({
              type: record.Type.CUSTOMER,
              id: requestBody.data.customerId
            });
            var custCompanyName = customerRec.getValue('companyname');
            var custAddress = customerRec.getSublistValue({
              sublistId: 'addressbook',
              fieldId: 'addr1_initialvalue',
              line: 0
            });
            var custCountry = customerRec.getSublistValue({
              sublistId: 'addressbook',
              fieldId: 'country_initialvalue',
              line: 0
            });
            var custCity = customerRec.getSublistValue({
              sublistId: 'addressbook',
              fieldId: 'city_initialvalue',
              line: 0
            });
            var custZip = customerRec.getSublistValue({
              sublistId: 'addressbook',
              fieldId: 'zip_initialvalue',
              line: 0
            });
            var isIndividualValue = customerRec.getValue({
              fieldId: 'isperson'
            });
            var isIndividual = (isIndividualValue === 'F') ? false : true;
            var custPib = customerRec.getValue('custentity_pib');
            var custMaticniBroj = customerRec.getValue('custentity_matbrpred');
          } catch (error) {
            log.error('Error!', "Error during loading a customer record from CM!\nError message: " + error);
          }

          // Get invoice from CM if exists
          try {
            var invoiceRec = record.load({
              type: record.Type.INVOICE,
              id: cmRec.getValue('createdfrom')
            });
            var invoiceTranId = invoiceRec.getValue('tranid'),
              invoiceTranDate = dUtil.formatDate(invoiceRec.getValue('trandate'));
          } catch (error) {
            log.error('Error!', "This CM is not created from invoice thus not contain invoice record in the body.\n Error message: " + error);
          }

          // Get custom field values vanjafakture and napomenaoporeskomoslobadjanju
          var napomenaOPoreskomOslobadjanju = '',
            mestoIzdavanjaFakture = '',
            napomenaZaPrint = '',
            orderNum = '';
          try {
            mestoIzdavanjaFakture = invoiceRec.getValue({
              fieldId: 'custbody_mestoizdavanjafakture'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_mestoizdavanjafakture'");
          }
          try {
            orderNum = invoiceRec.getValue('custbody_rsm_crm_ordernum');
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_rsm_crm_ordernum'");
          }
          try {
            napomenaOPoreskomOslobadjanju = invoiceRec.getValue({
              fieldId: 'custbody_napomenaporezoslobodjen'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_napomenaporezoslobodjen'");
          }
          try {
            napomenaZaPrint = invoiceRec.getValue({
              fieldId: 'custbody_rsm_napomena_za_print'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_rsm_napomena_za_print'")
          }

          // Template data
          var data = {
            tranId: requestBody.data.tranId,
            tranDate: dUtil.getDateFromFormattedDate(requestBody.data.tranDate),
            totalNetAmount: formatCurrency(cmAmount.toFixed(2)),
            totalTaxAmount: formatCurrency(cmTaxAmount.toFixed(2)),
            totalGrossAmount: formatCurrency(cmGrossAmount.toFixed(2)),
            totalNetAmountIno: (cmAmountIno != 0) ? '(' + formatCurrency(cmAmountIno.toFixed(2)) + currencyAppend + ')' : '',
            totalTaxAmountIno: (cmTaxAmountIno != 0) ? '(' + formatCurrency(cmTaxAmountIno.toFixed(2)) + currencyAppend + ')' : '',
            totalGrossAmountIno: (cmGrossAmountIno != 0) ? '(' + formatCurrency(cmGrossAmountIno.toFixed(2)) + currencyAppend + ')' : '',
            totalNetAmountRsd: (cmAmountRsd != 0) ? '(' + formatCurrency(cmAmountRsd.toFixed(2)) + 'RSD)' : '',
            totalTaxAmountRsd: (cmTaxAmountRsd != 0) ? '(' + formatCurrency(cmTaxAmountRsd.toFixed(2)) + 'RSD)' : '',
            totalGrossAmountRsd: (cmGrossAmountRsd != 0) ? '(' + formatCurrency(cmGrossAmountRsd.toFixed(2)) + 'RSD)' : '',
            rate: requestBody.data.rate,
            mestoIzdavanja: mestoIzdavanjaFakture,
            napomenaOPoreskomOslobadjanju: napomenaOPoreskomOslobadjanju,
            napomenaZaPrint: napomenaZaPrint,
            datumIzdavanja: dUtil.getDateFromFormattedDate(dUtil.formatDate(cmRec.getValue('trandate'))),
            orderNum: orderNum,
            transactionCurrency: transactionCurrency,

            items: {
              list: items,
              totalNetAmount: formatCurrency(itemsTotalNetAmount.toFixed(2)),
              totalTaxAmount: formatCurrency(itemsTotalTaxAmount.toFixed(2)),
              totalGrossAmount: formatCurrency(itemsTotalGrossAmount.toFixed(2))
            },

            bankAccountsData: bankAccountsData,

            customer: {
              companyName: custCompanyName,
              address: custAddress,
              zip: custZip,
              city: custCity,
              maticniBroj: custMaticniBroj,
              country: (custCountry === 'RS') ? 'Srbija' : custCountry,
              pib: custPib,
              isIndividual: isIndividual
            },

            companyInformation: {
              name: companyName,
              address: address,
              city: city,
              country: (country === 'RS') ? 'Srbija' : country,
              phone: phone,
              pib: pib,
              zip: zip,
              maticniBroj: maticniBroj,
              emailUrl: emailUrl,
              webSite: webSite,
              logoUrl: 'https://' + domain + logoUrl.replace(/&/g, '&amp;'),
            },

            invoice: {
              tranId: invoiceTranId,
              tranDate: dUtil.getDateFromFormattedDate(invoiceTranDate)
            },

            user: {
              id: userId,
              name: userName
            }
          }

          var renderer = render.create();
          renderer.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias: "JSON",
            data: data
          });

          custCountry = (custCountry === 'RS') ? '' : custCountry;
          var configRecord, credit_memo_pdf_rs, credit_memo_pdf_ino;
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
              return message;
            }
          } else {
            configRecord = getConfigRecordWithoutSubsidiaryFeature();
          }
          if (custCountry === 'RS' || custCountry === '' || custCountry === 'ME' || custCountry === 'BA' || custCountry === 'HR') {
            credit_memo_pdf_rs = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_cm_pdf'
            });
            if (!credit_memo_pdf_rs) {
              log.error('Error', 'Credit memo PDF template field is empty inside Subsidiary Config.')
              message = {
                type: 'error',
                title: 'Greska!',
                message: "Molimo vas da podesite PDF Template Fields unutar Subsidiary config-a za subsidiary sa transakcije."
              };
              return  {
                message: message
              };
            }
            renderer.setTemplateByScriptId(credit_memo_pdf_rs);
          }  else {
            credit_memo_pdf_ino = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_cm_pdf_ino'
            });
            if (!credit_memo_pdf_ino) {
              log.error('Error', 'Credit memo PDF template field is empty inside Subsidiary Config.')
              message = {
                type: 'error',
                title: 'Greska!',
                message: "Molimo vas da podesite PDF Template Fields unutar Subsidiary config-a za subsidiary sa transakcije."
              };
              return  {
                message: message
              };
            }
            renderer.setTemplateByScriptId(credit_memo_pdf_ino);
          }

          var pdfFile = renderer.renderAsPdf();

          // Delete the old pdf file if it already exists
          var olfFileId = cmRec.getValue('custbody_cust_dep_pdf_file');
          if (olfFileId) {
            file.delete({
              id: olfFileId
            });
            log.audit('Success', 'Old pdf file deleted!');
          }

          // Save a new pdf file to file cabinet and add it to the cust dep form
          var newPdfFile = file.create({
            name: "PDF faktura - credit memo:" + requestBody.data.creditMemoId,
            fileType: file.Type.PDF,
            contents: pdfFile.getContents(),
            folder: file.load({
              id: './pdf_files/flagfile'
            }).folder
          });
          var newPdfFileId = newPdfFile.save();
          log.audit('Success', "New pdf file created! ID:" + newPdfFileId);

          cmRec.setValue({
            fieldId: 'custbody_cust_dep_pdf_file',
            value: newPdfFileId
          });
          cmRec.save();

          message = {
            type: 'confirmation',
            title: 'Uspesno!',
            message: "PDF faktura za Credit Memo " + requestBody.data.creditMemoId + " je uspesno kreirana! Osvezite stranicu.",
            duration: '0'
          };
        } catch (error) {
          log.error('Error!', error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Greska prilikom kreiranja pdf fakture za Credit Memo!"
          }
        }

      } else if (requestBody.action === 'emailpdf') {
        try {
          var cmRec = record.load({
            type: record.Type.CREDIT_MEMO,
            id: requestBody.data.creditMemoId
          });

          // Get file from customer deposit record
          var pdfFileId = cmRec.getValue('custbody_cust_dep_pdf_file');
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
            id: cmRec.getValue('entity')
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
            var subsidiaryId = cmRec.getValue({
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
              return message;
            }
          } else {
            configRecord = getConfigRecordWithoutSubsidiaryFeature();
          }

          var credit_memo_email_rs = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_cm_email'
          });
          var credit_memo_email_ino = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_cm_email_ino'
          });

          var emailTemplateId = '';

          if (custCountry === 'RS' || custCountry === '' || custCountry === 'ME' || custCountry === 'BA' || custCountry === 'HR') {
            emailTemplateId = credit_memo_email_rs
          } else {
            emailTemplateId = credit_memo_email_ino;
          }

          if (!emailTemplateId) {
            log.error('Error', "Credit memo email template field is empty inside Subsidiary Config.")
            message = {
              type: 'error',
              title: 'Greska!',
              message: "Molimo vas da podesite EMAIL Template Fields unutar Subsidiary config-a za subsidiary sa transakcije."
            };
            return message;
          }
          var locationText = cmRec.getText('location');
          // Get customer email - recipient email
          var recipientEmail = getEmailFromCustomer(customerRec, locationText);

          var ccEmailArray = [];
          var bccEmailArray = [];
          var transactionLocationId = cmRec.getValue({
            fieldId: 'location'
          });

          var transactionCustomerId = cmRec.getValue('entity');

          var transactionCCField = cmRec.getText('custbody_rsm_additional_cc_email');

          var transactionBCCField = cmRec.getText('custbody_rsm_additional_bcc_email');

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
            return message;
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

            var signatureData = getSignatureUser(cmRec);
            var websiteClass = getWebsiteClass(cmRec);
            var logoUrl = getLogoForEmail(cmRec);

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
            var emailSender = getEmailSender(cmRec);

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
              recipients: recipientEmail, // email of recipient as a string - could be an array of strings also'
              cc: ccEmailArray, // array of strings for cc of email
              bcc: bccEmailArray, // array of strings for bcc of email
              subject: emailSubject, // subject as a string
              attachments: [pdfFile], // insert file.File - array
              relatedRecords: {
                entityId: transactionCustomerId,
                transactionId: requestBody.data.creditMemoId
              }
            });
          } else {
            email.send({
              author: emailSender, // Internal id of email sender - current user
              body: content, // insert email body as a string
              recipients: recipientEmail, // email of recipient as a string - could be an array of strings also'
              cc: ccEmailArray, // array of strings for cc of email
              bcc: bccEmailArray, // array of strings for bcc of email
              subject: emailSubject, // subject as a string
              attachments: [pdfFile], // insert file.File - array
              relatedRecords: {
                entityId: transactionCustomerId,
                transactionId: requestBody.data.creditMemoId
              },
              replyTo: replyToEmailAddress
            });
          }


          var emailStatusId = getEmailStatusId('SENT');
          cmRec.setValue({
            fieldId: 'custbody_rsm_creditmemo_email_status',
            value: emailStatusId
          });
          cmRec.save();

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
            message: "Slanje Email-a je neuspesno! Proverite log restlet skripte!",
            duration: '0'
          };
        }
      }

      return {
        message: message
      }

    }

    return {
      post: post
    };

  });
