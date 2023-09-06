/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 *  Back-end functionality which generates pdf invoice and sends it via E-mail
 *
 */
define(['N/record', 'N/render', 'N/config', 'N/runtime', 'N/file', 'N/query', 'N/url', 'N/email', 'N/log', 'N/search', './dateUtil.js', 'N/redirect', 'N/util'],
  function (record, render, config, runtime, file, query, url, email, log, search, dateUtil, redirect, util) {

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
    
    function getAttachedFiles(recordId, recordType) {
      var invoiceSearchObj = search.create({
        type: recordType,
        filters:
          [
            ["internalid", "anyof", recordId],
            "AND",
            ["mainline", "is", "T"]
          ],
        columns:
          [
            search.createColumn({
              name: "internalid",
              join: "file",
              label: "Internal ID"
            }),
            search.createColumn({
              name: "name",
              join: "file",
              label: "Name"
            })
          ]
      }).run();

      var attachedFilesId = [];
      var results = [],
        start = 0,
        end = 1000;
      while (true) {
        var tempList = invoiceSearchObj.getRange({
          start: start,
          end: end
        });

        if (tempList.length === 0) {
          break;
        }

        Array.prototype.push.apply(results, tempList);
        start += 1000;
        end += 1000;
      }

      util.each(results, function (result) {
        var allValues = result.getAllValues();
        try {
          var fileId = allValues['file.internalid'][0]['value'];
          if (fileId) {
            attachedFilesId.push(fileId);
          }
        } catch (error) {
          log.error('Attached Files Error', error);
        }

        return true;
      });

      return attachedFilesId;
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

    function getBankAccountsWithSubsidiary(locationId, subsidiaryId, currencyId, bankAccounts) {

      var bankAccountsData = [];
      if (bankAccounts.toString() !== '') { // If Bank Accounts field is not empty on transaction
        bankAccounts = "(" + bankAccounts.toString() + ")"; // Transformation needed for query
        var bankAccountsQuery = query.runSuiteQL({
          query: 'SELECT custrecord_rsm_comp_ba_swift, custrecord_rsm_comp_ba_account, custrecord_rsm_comp_ba_preferred, custrecord_rsm_comp_ba_bank FROM customrecord_rsm_company_bank_accounts WHERE id IN ' + bankAccounts
        });

        bankAccountsQuery.results.forEach(function (item) { // Turning query results into obj and adding it to array
          var obj = {};
          obj.swift = item.values[0];
          obj.iban = item.values[1];
          obj.bankName = item.values[3];
          bankAccountsData.push(obj)
        });
      } else {
        var bankAccountsQuery = query.runSuiteQL({  // If Bank Accounts field is empty on transaction
          query: 'SELECT custrecord_rsm_comp_ba_swift, custrecord_rsm_comp_ba_account, custrecord_rsm_comp_ba_preferred, custrecord_rsm_comp_ba_locations, custrecord_rsm_comp_ba_bank FROM customrecord_rsm_company_bank_accounts WHERE custrecord_rsm_comp_ba_currency =? AND custrecord_rsm_comp_ba_subsidiary =?',
          params: [currencyId, subsidiaryId]
        });
        var tempData = [];
        bankAccountsQuery.results.forEach(function (item) { // Turning query results into obj and adding it to array
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
            if (arrayItem.locations.indexOf(locationId) !== -1 && arrayItem.preferred) { // If there is location in BankAccount record and that record is preferred
              bankAccountsData.push(arrayItem);
            }
          });
          if (bankAccountsData.length === 0) {
            tempData.forEach(function (arrayItem) {
              if (arrayItem.locations.indexOf(locationId) !== -1 && !arrayItem.preferred) { // If there is location in BankAccount record and that record is not preferred
                bankAccountsData.push(arrayItem);
              }
            });
          }
        }
        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && arrayItem.preferred) {  // If there is no location in BankAccount record and that record is preferred
              bankAccountsData.push(arrayItem);
            }
          });
        }

        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && !arrayItem.preferred) { // If there is no location in BankAccount Record and that record is not preferred
              bankAccountsData.push(arrayItem);
            }
          })
        }
        if (bankAccountsData.length === 0) {
          var emptyObject = {
            swift: '',
            iban: '',
            bankName: ''
          };
          bankAccountsData.push(emptyObject);
        }
      }
      return bankAccountsData;
    }

    function getBankAccountsWithoutSubsidiary(locationId, currencyId, bankAccounts) {
      var bankAccountsData = [];
      if (bankAccounts.toString() !== '') { //If Bank Accounts field is not empty on transaction
        bankAccounts = "(" + bankAccounts.toString() + ")"; // Transformation needed for query
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
            if (arrayItem.locations.indexOf(locationId) !== -1 && arrayItem.preferred) { // If there is location in BankAccount record and that record is preferred
              bankAccountsData.push(arrayItem);
            }
          });
          if (bankAccountsData.length === 0) {
            tempData.forEach(function (arrayItem) {
              if (arrayItem.locations.indexOf(locationId) !== -1 && !arrayItem.preferred) { // If there is location in BankAccount record and that record is not preferred
                bankAccountsData.push(arrayItem);
              }
            });
          }
        }
        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && arrayItem.preferred) { // If there is no location in BankAccount record and that record is preferred
              bankAccountsData.push(arrayItem);
            }
          });
        }

        if (bankAccountsData.length === 0) {
          tempData.forEach(function (arrayItem) {
            if (arrayItem.locations.length === 0 && !arrayItem.preferred) { // If there is no location in BankAccount Record and that record is not preferred
              bankAccountsData.push(arrayItem);
            }
          })
        }
        if (bankAccountsData.length === 0) {
          var emptyObject = {
            swift: '',
            iban: '',
            bankName: ''
          };
          bankAccountsData.push(emptyObject);
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

    // Restlet entry-point function (post)
    function post(requestBody) {
      // Get current user and user's data
      var user = runtime.getCurrentUser();
      var userName = user.name;
      var userId = user.id;
      var userEmail = user.email;

      if (requestBody.action === 'createpdf') {
        try {
          // Load invoice record
          var invoiceRec = record.load({
            type: record.Type.INVOICE,
            id: requestBody.invoiceId
          });
        } catch (error) {
          log.error('Error', error);
          message = {
            type: 'error',
            title: 'Greska',
            message: "Doslo je do greske prilikom kreiranja PDF fakture! Proverite log restlet skripte!",
            duration: '0'
          };
          return {
            message: message
          };
        }

        try {
          var customerName = '',
            customerCompany = '',
            customerAddress = '',
            customerPhone = '',
            customerPib = '',
            customerMaticniBroj = '',
            customerPozivNaBroj = '',
            customerModel = '',
            invoiceAmount = 0,
            invoiceTaxAmount = 0,
            invoiceGrossAmount = 0,
            invoiceAmountIno = 0,
            invoiceTaxAmountIno = 0,
            invoiceGrossAmountIno = 0,
            invoiceAmountRsd = 0,
            invoiceTaxAmountRsd = 0,
            invoiceGrossAmountRsd = 0,
            depAppAmount = 0,
            depAppAmountIno = 0,
            depAppTaxAmount = 0,
            depAppTaxAmountIno = 0,
            depAppAmountRsd = 0,
            depAppTaxAmountRsd = 0;

          // invoiceAmount = invoiceRec.getValue('subtotal');
          // invoiceTaxAmount = invoiceRec.getValue('taxtotal');
          var invoiceCustomerId = invoiceRec.getValue('entity');
          var invoiceCustomerRec = record.load({
            type: record.Type.CUSTOMER,
            id: invoiceCustomerId
          });
          var pdfBothLanguages = invoiceCustomerRec.getValue({
            fieldId: 'custentity_rsm_dvojezicna_faktura'
          });
          var customerCountry = invoiceCustomerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'country_initialvalue',
            line: 0
          });
          // var invoiceCurrency = invoiceRec.getText('currency');
          var currencyRec = record.load({
            type: record.Type.CURRENCY,
            id: invoiceRec.getValue('currency')
          });
          var invoiceCurrency = currencyRec.getValue('symbol');

          var currencyDisplaySymbol = currencyRec.getValue('displaysymbol');
          var currencyAppend = (currencyDisplaySymbol) ? currencyDisplaySymbol : invoiceCurrency;

          // if (invoiceCurrency === 'EUR' && (customerCountry === 'Serbia' || customerCountry === 'RS')) {
          //   var exchangeRate = invoiceRec.getValue('exchangerate');
          //   invoiceTaxAmount *= exchangeRate;
          //   invoiceAmount *= exchangeRate;
          // }
          // invoiceGrossAmount = invoiceAmount + invoiceTaxAmount;

          // Load customer record and get field values
          var customerId = invoiceRec.getValue('entity'),
            customerRec = null;
          try {
            customerRec = record.load({
              type: record.Type.CUSTOMER,
              id: customerId
            });
            customerName = customerRec.getValue('companyname');
            customerCompany = customerRec.getValue('companyname');
            customerAddress = customerRec.getValue('defaultaddress');
            customerPhone = customerRec.getValue('phone');
            customerPib = customerRec.getValue('custentity_pib');
            customerMaticniBroj = customerRec.getValue('custentity_matbrpred');
            customerPozivNaBroj = customerRec.getValue('custbody_poziv_na_broj');
            customerModel = customerRec.getValue('custbody_broj_modela');
            customerCountry = customerRec.getSublistValue({
              sublistId: 'addressbook',
              fieldId: 'country_initialvalue',
              line: 0
            });
          } catch (err) {
            log.error('Error', "Could not load linked customer record");
          }

          // Load deposit application transaction records and get field values, calculate amounts and tax amounts
          var depAppIds = []; // stores all deposit application ids
          var deposits = [];
          var depAmountTotal = 0, depNetAmountTotal = 0, depTaxAmountTotal = 0;
          var depAmountTotalIno = 0, depNetAmountTotalIno = 0, depTaxAmountTotalIno = 0;
          var depAmountTotalRsd = 0, depNetAmountTotalRsd = 0, depTaxAmountTotalRsd = 0;
          var lineCount = invoiceRec.getLineCount('links');

          for (var i = 0; i < lineCount; i++) {
            try {
              var depositAppId = invoiceRec.getSublistValue('links', 'id', i),
                depositAppRec = null;

              // If deposit app id is already in this array, continue to next line
              if (depAppIds.indexOf(depositAppId) !== -1) {
                continue;
              }
              depAppIds.push(depositAppId);

              depositAppRec = record.load({
                type: record.Type.DEPOSIT_APPLICATION,
                id: depositAppId
              });
              var custDepRecId = depositAppRec.getValue('deposit');
              depAppAmount = depositAppRec.getValue('applied');

              // Load customer deposit record using deposit field value (customer deposit id) from deposit application record
              var customerDepositRec = record.load({
                type: record.Type.CUSTOMER_DEPOSIT,
                id: custDepRecId
              });
              var custDepRate = customerDepositRec.getValue('custbody_cust_dep_poreska_stopa');
              var custDepTaxCode = customerDepositRec.getValue('custbody_poreski_kod_cust_dep_rsm');
              var custDepDate = dUtil.formatDate(customerDepositRec.getValue('trandate'));

              // Get currency and exchangerate from customer deposit record
              // Check if currency is EUR and convert depAppAmount to RSD using exchangeRate
              // var currency = customerDepositRec.getText('currency');
              var custDepCurrencyRec = record.load({
                type: record.Type.CURRENCY,
                id: customerDepositRec.getValue('currency')
              });
              var currency = custDepCurrencyRec.getValue('symbol');
              // if customer IS from Serbia and transaction has foreigh currency
              if (currency !== 'RSD' && (customerCountry === 'Serbia' || customerCountry === 'RS')) {
                var exchangeRate = customerDepositRec.getValue('exchangerate');
                depAppAmountIno = depAppAmount;
                depAppAmount *= exchangeRate;
                // if customer IS NOT from Serbia and transaction has foreigh currency
              } else if (currency !== 'RSD' && (!(customerCountry === 'Serbia' || customerCountry === 'RS'))) {
                var exchangeRate = customerDepositRec.getValue('exchangerate');
                depAppAmountRsd = depAppAmount * exchangeRate;
              }

              var taxCodeRec = record.load({
                type: record.Type.SALES_TAX_ITEM,
                id: custDepTaxCode
              });
              var reverseCharge = taxCodeRec.getValue('reversecharge');

              rate = parseInt(custDepRate.toString().replace(/%/g, ''));
              if (reverseCharge === 'T') {
                try {
                  rate = record.load({
                    id: taxCodeRec.getValue('parent'),
                    type: record.Type.SALES_TAX_ITEM
                  }).getValue("rate");

                  // Calculate tax value with parent rate
                  depAppTaxAmount = depAppAmount * (rate / 100);
                  depAppTaxAmountIno = depAppAmountIno * (rate / 100);
                  depAppTaxAmountRsd = depAppAmountRsd * (rate / 100);
                } catch (err) {
                  log.error('Error', "Couldn't load tax item 'parent' record\n" + err);
                  return;
                }
              } else {
                // Calculate tax value with standard rate
                depAppTaxAmount = depAppAmount / (1 + rate / 100) * (rate / 100);
                depAppTaxAmountIno = depAppAmountIno / (1 + rate / 100) * (rate / 100);
                depAppTaxAmountRsd = depAppAmountRsd / (1 + rate / 100) * (rate / 100);
              }
              var applianceCustDep = depositAppRec.getText('deposit');
              var splitArrayDeposit = applianceCustDep.split(' ');
              var docNumber = splitArrayDeposit[2];

              deposits.push({
                tranDate: dUtil.getDateFromFormattedDate(dUtil.formatDate(depositAppRec.getValue('depositdate'))),
                custDepDocNumber: docNumber,
                grossAmount: formatCurrency(parseFloat(depAppAmount).toFixed(2)),
                grossAmountIno: (depAppAmountIno != 0) ? '(' + formatCurrency(parseFloat(depAppAmountIno).toFixed(2)) + currencyAppend + ')' : '',
                grossAmountRsd: (depAppAmountRsd != 0) ? '(' + formatCurrency(parseFloat(depAppAmountRsd).toFixed(2)) + 'RSD)' : '',
                netAmount: formatCurrency(parseFloat(depAppAmount - depAppTaxAmount).toFixed(2)),
                netAmountIno: ((depAppAmountIno - depAppTaxAmountIno) != 0) ? '(' + formatCurrency(parseFloat(depAppAmountIno - depAppTaxAmountIno).toFixed(2)) + currencyAppend + ')' : '',
                netAmountRsd: ((depAppAmountRsd - depAppTaxAmountRsd) != 0) ? '(' + formatCurrency(parseFloat(depAppAmountRsd - depAppTaxAmountRsd).toFixed(2)) + 'RSD)' : '',
                taxAmount: formatCurrency(parseFloat(depAppTaxAmount).toFixed(2)),
                taxAmountIno: (depAppTaxAmountIno != 0) ? '(' + formatCurrency(parseFloat(depAppTaxAmountIno).toFixed(2)) + currencyAppend + ')' : '',
                taxAmountRsd: (depAppTaxAmountRsd != 0) ? '(' + formatCurrency(parseFloat(depAppTaxAmountRsd).toFixed(2)) + 'RSD)' : ''
              });

              depAmountTotal += depAppAmount;
              depAmountTotalIno += depAppAmountIno;
              depAmountTotalRsd += depAppAmountRsd;
              depTaxAmountTotal += depAppTaxAmount;
              depTaxAmountTotalIno += depAppTaxAmountIno;
              depTaxAmountTotalRsd += depAppTaxAmountRsd;
              depNetAmountTotal += depAppAmount - depAppTaxAmount;
              depNetAmountTotalIno += depAppAmountIno - depAppTaxAmountIno;
              depNetAmountTotalRsd += depAppAmountRsd - depAppTaxAmountRsd;
              depositAppRec.save();
            } catch (error) {
              log.error('Error in deposit application part:', error);
            }
          } // End of for loop

          //Check if custbody_rsm_infs_fakturista is empty
          var fakturistaId = invoiceRec.getValue({
            fieldId: 'custbody_rsm_infs_fakturista'
          });
          if (fakturistaId) {
            var fakturistaLookup = search.lookupFields({
              type: search.Type.EMPLOYEE,
              id: fakturistaId,
              columns: ['entityid']
            });
            userName = fakturistaLookup.entityid;
            userId = fakturistaId;
          }

          // Get items line data from invoice
          var lineCount = invoiceRec.getLineCount({
            sublistId: 'item'
          });
          var packageQuantityFlag = false;
          var items = [];
          for (var i = 0; i < lineCount; i++) {
            var amt = parseFloat(invoiceRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'amount',
              line: i
            }));
            var taxAmt = parseFloat(invoiceRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'tax1amt',
              line: i
            }));
            var unitPrice = parseFloat(invoiceRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'rate',
              line: i
            }));
            var unitPriceFull = parseFloat(invoiceRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'custcol_rsm_item_rate_full',
              line: i
            }));
            var amtIno = 0,
              taxAmtIno = 0,
              unitPriceIno = 0,
              grsAmtIno = 0,
              unitPriceFullIno = 0,
              amtRsd = 0,
              taxAmtRsd = 0,
              unitPriceRsd = 0,
              unitPriceFullRsd = 0,
              grsAmtRsd = 0;
            if (invoiceCurrency !== 'RSD' && (customerCountry === 'Serbia' || customerCountry === 'RS')) {
              amtIno = amt;
              taxAmtIno = taxAmt;
              unitPriceIno = unitPrice;
              unitPriceFullIno = unitPriceFull;
              grsAmtIno = amtIno + taxAmtIno;
              invoiceGrossAmountIno += grsAmtIno;
              invoiceTaxAmountIno += taxAmtIno;
              invoiceAmountIno += amtIno;

              var exchangeRate = invoiceRec.getValue('exchangerate');
              amt *= exchangeRate;
              taxAmt *= exchangeRate;
              unitPrice = (unitPrice) ? unitPrice * exchangeRate : '';
              unitPriceFull = (unitPriceFull) ? unitPriceFull * exchangeRate : '';
            } else if (invoiceCurrency !== 'RSD' && (!(customerCountry === 'Serbia' || customerCountry === 'RS'))) {
              var exchangeRate = invoiceRec.getValue('exchangerate');
              amtRsd = amt * exchangeRate;
              taxAmtRsd = taxAmt * exchangeRate;
              grsAmtRsd = amtRsd + taxAmtRsd;
              unitPriceRsd = (unitPrice) ? unitPrice * exchangeRate : '';
              unitPriceFullRsd = (unitPriceFull) ? unitPriceFull * exchangeRate : '';

              invoiceGrossAmountRsd += grsAmtRsd;
              invoiceTaxAmountRsd += taxAmtRsd;
              invoiceAmountRsd += amtRsd;
            }
            var grsAmt = amt + taxAmt;
            invoiceGrossAmount += grsAmt;
            invoiceTaxAmount += taxAmt;
            invoiceAmount += amt;
            var packageQuantity = invoiceRec.getSublistValue({
              sublistId: 'item',
              fieldId: 'custcol_rsm_package_quantity',
              line: i
            });
            if (packageQuantity && packageQuantity !== 0) {
              packageQuantityFlag = true;
            }
            items.push({
              name: invoiceRec.getSublistText({
                sublistId: 'item',
                fieldId: 'item',
                line: i
              }),
              description: invoiceRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'description',
                line: i
              }),
              units: invoiceRec.getSublistText({
                sublistId: 'item',
                fieldId: 'units',
                line: i
              }),
              discount: invoiceRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_rsm_item_rate_discount',
                line: i
              }),
              packageQuantity: packageQuantity,
              quantity: invoiceRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'quantity',
                line: i
              }),
              unitPrice: (unitPrice) ? formatCurrency(unitPrice.toFixed(2)) : '',
              unitPriceIno: (unitPriceIno != 0) ? '(' + formatCurrency(unitPriceIno.toFixed(2)) + currencyAppend + ')' : '',
              unitPriceRsd: (unitPriceRsd != 0) ? '(' + formatCurrency(unitPriceRsd.toFixed(2)) + 'RSD)' : '',
              unitPriceFull: (unitPriceFull) ? formatCurrency(unitPriceFull.toFixed(2)) : '',
              unitPriceFullIno: (unitPriceFullIno != 0) ? '(' + formatCurrency(unitPriceFullIno.toFixed(2)) + currencyAppend + ')' : '',
              unitPriceFullRsd: (unitPriceFullRsd != 0) ? '(' + formatCurrency(unitPriceFullRsd.toFixed(2)) + 'RSD)' : '',
              taxRate: invoiceRec.getSublistValue({
                sublistId: 'item',
                fieldId: 'taxrate1',
                line: i
              }),
              amount: formatCurrency(parseFloat(amt).toFixed(2)),
              amountIno: (amtIno != 0) ? '(' + formatCurrency(parseFloat(amtIno).toFixed(2)) + currencyAppend + ')' : '',
              amountRsd: (amtRsd != 0) ? '(' + formatCurrency(parseFloat(amtRsd).toFixed(2)) + 'RSD)' : '',
              taxAmount: formatCurrency(parseFloat(taxAmt).toFixed(2)),
              taxAmountIno: (taxAmtIno != 0) ? '(' + formatCurrency(parseFloat(taxAmtIno).toFixed(2)) + currencyAppend + ')' : '',
              taxAmountRsd: (taxAmtRsd != 0) ? '(' + formatCurrency(parseFloat(taxAmtRsd).toFixed(2)) + 'RSD)' : '',
              grossAmount: formatCurrency(parseFloat(grsAmt).toFixed(2)),
              grossAmountIno: (grsAmtIno != 0) ? '(' + formatCurrency(parseFloat(grsAmtIno).toFixed(2)) + currencyAppend + ')' : '',
              grossAmountRsd: (grsAmtRsd != 0) ? '(' + formatCurrency(parseFloat(grsAmtRsd).toFixed(2)) + 'RSD)' : ''
            });
          }

          var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
            feature: 'SUBSIDIARIES'
          });

          var locationId = invoiceRec.getValue('location');
          var currencyId = invoiceRec.getValue('currency');
          var bankAccounts = invoiceRec.getValue('custbody_rsm_trans_bank_acc');
          var bankAccountsData = [];
          if ((customerCountry !== 'Serbia' || customerCountry !== 'RS')) {
            if (subsidiaryFeatureCheck) {
              var subsidiaryId = invoiceRec.getValue('subsidiary');
              bankAccountsData = getBankAccountsWithSubsidiary(locationId, subsidiaryId, currencyId, bankAccounts);
            } else {
              bankAccountsData = getBankAccountsWithoutSubsidiary(locationId, currencyId, bankAccounts);
            }
          }

          // Get logo from subsidiary first. If it doesn't exist, get logo from company information
          // Get other company information also
          var domain, logoUrl, companyName, address, city, phone, emailUrl, webSite, accountNumber, pib, maticniBroj,
            country, zip;
          if (subsidiaryFeatureCheck) {

            var subsidiaryId = invoiceRec.getValue({
              fieldId: 'subsidiary'
            });
            var configRecord = getConfigRecord(subsidiaryId);

            var subsidiaryRec = record.load({
              type: record.Type.SUBSIDIARY,
              id: subsidiaryId
            });

            var locationBoolean = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_address_from_loc'
            });
            var locationId = invoiceRec.getValue({
              fieldId: 'location'
            });
            var locationRecord = record.load({
              type: record.Type.LOCATION,
              id: locationId
            });
            logoUrl = getLogoUrl({
              transactionRecord: invoiceRec,
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
            phone = getPhoneForPrintout(subsidiaryRec, locationRecord);
            emailUrl = getEmailForPrintout(subsidiaryRec, locationRecord);
            webSite = getWebsiteForPrintout(subsidiaryRec, locationRecord);
            country = addrSubRec.getValue({
              fieldId: 'country'
            });
            zip = addrSubRec.getValue({
              fieldId: 'zip'
            });
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
                transactionRecord: invoiceRec,
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
              phone = companyInfo.getValue({
                fieldId: 'fax'
              });
              country = companyInfo.getValue({
                fieldId: 'country'
              });
              zip = companyInfo.getValue({
                fieldId: 'zip'
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
              phone = '';
              emailUrl = '';
              webSite = '';
              pib = '';
              maticniBroj = '';
              log.error('Error', "Couldn't get company information data! Error message:\n" + error);
            }
          }

          var napomenaOPoreskomOslobadjanju = '',
            mestoIzdavanjaFakture = '',
            datumIzdavanjaFakture = '',
            napomenaZaPrint = '',
            nacinIsporuke = '',
            nacinPlacanja = '';
          try {
            var nacinIsporukeId = invoiceRec.getValue({
              fieldId: 'custbody_rsm_sales_delvtype'
            });
            if (nacinIsporukeId) {
              var deliveryLookup = search.lookupFields({
                type: 'customrecord_rsm_delivery_type',
                id: nacinIsporukeId,
                columns: ['custrecord_rsm_deltype_printout']
              });
              nacinIsporuke = deliveryLookup.custrecord_rsm_deltype_printout;
            }
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_rsm_sales_delvtype'");
          }
          try {
            var nacinPlacanjaId = invoiceRec.getValue({
              fieldId: 'custbody_rsm_sales_payment_type'
            });
            if (nacinPlacanjaId) {
              var paymentLookup = search.lookupFields({
                type: 'customrecord_rsm_payment_type',
                id: nacinPlacanjaId,
                columns: ['custrecord_rsm_paytype_printout']
              });
              nacinPlacanja = paymentLookup.custrecord_rsm_paytype_printout;
            }
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_rsm_sales_payment_type'");
          }
          try {
            mestoIzdavanjaFakture = invoiceRec.getValue({
              fieldId: 'custbody_mestoizdavanjafakture'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_mestoizdavanjafakture'");
          }
          try {
            napomenaOPoreskomOslobadjanju = invoiceRec.getValue({
              fieldId: 'custbody_napomenaporezoslobodjen'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_napomenaporezoslobodjen'");
          }
          try {
            datumIzdavanjaFakture = invoiceRec.getValue({
              fieldId: 'custbody_datumprometa'
            });
          } catch (error) {
            log.error('Error', "Couldn't get field value from 'custbody_datumprometa'");
          }
          try {
            napomenaZaPrint = invoiceRec.getValue({
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
          var custZip = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'zip_initialvalue',
            line: 0
          });
          var isIndividualValue = customerRec.getValue({
            fieldId: 'isperson'
          });
          var isIndividual = (isIndividualValue === 'F') ? false : true;


          var linkedInvoice = invoiceRec.getValue({
            fieldId: 'custbody_rsm_kz_linked_invoice'
          });
          var textLinkedInvoice = '';
          if (linkedInvoice) {
            textLinkedInvoice = invoiceRec.getText({
              fieldId: 'custbody_rsm_kz_linked_invoice'
            });
          }

          var data = {};
          var totalNetAmount = invoiceAmount - depNetAmountTotal;
          var totalTaxAmount = invoiceTaxAmount - depTaxAmountTotal;
          var totalAmount = totalNetAmount + totalTaxAmount;

          var totalNetAmountIno = invoiceAmountIno - depNetAmountTotalIno;
          var totalTaxAmountIno = invoiceTaxAmountIno - depTaxAmountTotalIno;
          var totalAmountIno = totalNetAmountIno + totalTaxAmountIno;

          var totalNetAmountRsd = invoiceAmountRsd - depNetAmountTotalRsd;
          var totalTaxAmountRsd = invoiceTaxAmountRsd - depTaxAmountTotalRsd;
          var totalAmountRsd = totalNetAmountRsd + totalTaxAmountRsd;

          var transactionStatus = invoiceRec.getText('status');
          var isPaidInFull = (transactionStatus === 'Paid In Full') ? true : false;

          data['totalNetAmount'] = formatCurrency(totalNetAmount.toFixed(2));
          data['totalTaxAmount'] = formatCurrency(totalTaxAmount.toFixed(2));
          data['totalAmount'] = formatCurrency(totalAmount.toFixed(2));


          data['totalNetAmountIno'] = (totalNetAmountIno != 0) ? '(' + formatCurrency(totalNetAmountRsd.toFixed(2)) + currencyAppend + ')' : '';
          data['totalTaxAmountIno'] = (totalTaxAmountIno != 0) ? '(' + formatCurrency(totalTaxAmountIno.toFixed(2)) + currencyAppend + ')' : '';
          data['totalAmountIno'] = (totalAmountIno != 0) ? '(' + formatCurrency(totalAmountIno.toFixed(2)) + currencyAppend + ')' : '';

          data['totalNetAmountRsd'] = (totalNetAmountRsd != 0) ? '(' + formatCurrency(totalNetAmountRsd.toFixed(2)) + 'RSD)' : '';
          data['totalTaxAmountRsd'] = (totalTaxAmountRsd != 0) ? '(' + formatCurrency(totalTaxAmountRsd.toFixed(2)) + 'RSD)' : '';
          data['totalAmountRsd'] = (totalAmountRsd != 0) ? '(' + formatCurrency(totalAmountRsd.toFixed(2)) + 'RSD)' : '';

          data.tranId = invoiceRec.getValue('tranid');
          data.tranDate = dUtil.getDateFromFormattedDate(dUtil.formatDate(invoiceRec.getValue('trandate')));
          data.startDate = dUtil.getDateFromFormattedDate(dUtil.formatDate(invoiceRec.getValue('startdate')));
          data.endDate = dUtil.getDateFromFormattedDate(dUtil.formatDate(invoiceRec.getValue('enddate')));
          data.dueDate = dUtil.getDateFromFormattedDate(dUtil.formatDate(invoiceRec.getValue('duedate')));
          data.salesEffectiveDate = dUtil.getDateFromFormattedDate(dUtil.formatDate(invoiceRec.getValue('saleseffectivedate')));
          data.linkedInvoice = textLinkedInvoice;
          data.packageQuantityFlag = packageQuantityFlag;
          data.orderNum = invoiceRec.getValue('custbody_rsm_crm_ordernum');
          data.nacinIsporuke = nacinIsporuke;
          data.nacinPlacanja = nacinPlacanja;
          data.isPaidInFull = isPaidInFull;

          data.napomenaOPoreskomOslobadjanju = napomenaOPoreskomOslobadjanju;
          data.mestoIzdavanjaFakture = mestoIzdavanjaFakture;
          data.datumIzdavanjaFakture = dUtil.getDateFromFormattedDate(dUtil.formatDate(datumIzdavanjaFakture));
          data.napomenaZaPrint = napomenaZaPrint;

          data.brojUgovora = invoiceRec.getValue('custbody_rsm_br_ugovora');
          data.brojModela = invoiceRec.getValue('custbody_broj_modela');
          data.pozivNaBroj = invoiceRec.getValue('custbody_poziv_na_broj');

          data.memo = invoiceRec.getValue('memo');
          data.location = invoiceRec.getText('location');

          data.amount = formatCurrency(parseFloat(invoiceAmount).toFixed(2));
          data.amountIno = (invoiceAmountIno != 0) ? '(' + formatCurrency(parseFloat(invoiceAmountIno).toFixed(2)) + currencyAppend + ')' : '';
          data.amountRsd = (invoiceAmountRsd != 0) ? '(' + formatCurrency(parseFloat(invoiceAmountRsd).toFixed(2)) + 'RSD)' : '';

          data.taxAmount = formatCurrency(parseFloat(invoiceTaxAmount).toFixed(2));
          data.taxAmountIno = (invoiceTaxAmountIno != 0) ? '(' + formatCurrency(parseFloat(invoiceTaxAmountIno).toFixed(2)) + currencyAppend + ')' : '';
          data.taxAmountRsd = (invoiceTaxAmountRsd != 0) ? '(' + formatCurrency(parseFloat(invoiceTaxAmountRsd).toFixed(2)) + 'RSD)' : '';

          data.grossAmount = formatCurrency(parseFloat(invoiceGrossAmount).toFixed(2));
          data.grossAmountIno = (invoiceGrossAmountIno != 0) ? '(' + formatCurrency(parseFloat(invoiceGrossAmountIno).toFixed(2)) + currencyAppend + ')' : '';
          data.grossAmountRsd = (invoiceGrossAmountRsd != 0) ? '(' + formatCurrency(parseFloat(invoiceGrossAmountRsd).toFixed(2)) + 'RSD)' : '';

          data.currency = invoiceRec.getText('currency');
          data.invoiceCurrency = invoiceCurrency;

          data.items = items;

          data.deposits = {
            list: deposits,
            depGrossAmountTotal: formatCurrency(parseFloat(depAmountTotal).toFixed(2)),
            depGrossAmountTotalIno: (depAmountTotalIno != 0) ? '(' + formatCurrency(parseFloat(depAmountTotalIno).toFixed(2)) + currencyAppend + ')' : '',
            depGrossAmountTotalRsd: (depAmountTotalRsd != 0) ? '(' + formatCurrency(parseFloat(depAmountTotalRsd).toFixed(2)) + 'RSD)' : '',
            depNetAmountTotal: formatCurrency(parseFloat(depAmountTotal - depTaxAmountTotal).toFixed(2)),
            depNetAmountTotalIno: ((depAmountTotalIno - depTaxAmountTotalIno) != 0) ? '(' + formatCurrency(parseFloat(depAmountTotalIno - depTaxAmountTotalIno).toFixed(2)) + currencyAppend + ')' : '',
            depNetAmountTotalRsd: ((depAmountTotalRsd - depTaxAmountTotalRsd) != 0) ? '(' + formatCurrency(parseFloat(depAmountTotalRsd - depTaxAmountTotalRsd).toFixed(2)) + 'RSD)' : '',
            depTaxAmountTotal: formatCurrency(parseFloat(depTaxAmountTotal).toFixed(2)),
            depTaxAmountTotalIno: (depTaxAmountTotalIno != 0) ? '(' + formatCurrency(parseFloat(depTaxAmountTotalIno).toFixed(2)) + currencyAppend + ')' : '',
            depTaxAmountTotalRsd: (depTaxAmountTotalRsd != 0) ? '(' + formatCurrency(parseFloat(depTaxAmountTotalRsd).toFixed(2)) + 'RSD)' : ''
          };

          data.user = {
            name: userName,
            id: userId
          };
          data.bankAccountsData = bankAccountsData;

          data.companyInformation = {
            name: companyName,
            address: address,
            city: city,
            phone: phone,
            country: (country === 'RS') ? 'Srbija' : country,
            zip: zip,
            email: emailUrl,
            webSite: webSite,
            accountNumber: accountNumber,
            pib: pib,
            maticniBroj: maticniBroj,
            logoUrl: 'https://' + domain + logoUrl.replace(/&/g, '&amp;'),
          };

          data.customer = {
            name: customerName,
            companyName: customerCompany,
            phone: customerPhone,
            pib: customerPib,
            maticniBroj: customerMaticniBroj,
            pozivNaBroj: customerPozivNaBroj,
            model: customerModel,
            address: customerAddress,
            isIndividual: isIndividual,
            addrDetails: {
              addrText: custAddress,
              city: custCity,
              country: (custCountry === 'RS') ? 'Srbija' : custCountry,
              zip: custZip
            }
          };
          var renderer = render.create();
          renderer.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias: "JSON",
            data: data
          });
          custCountry = (custCountry === 'RS') ? '' : custCountry;
          var configRecord, invoice_pdf_rs, invoice_pdf_ino, invoice_pdf_srb_eng;

          if (subsidiaryFeatureCheck) {
            var subsidiaryId = invoiceRec.getValue({
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
          try {
            invoice_pdf_rs = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_invoice_pdf'
            });

            invoice_pdf_ino = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_invoice_pdf_ino'
            });

            invoice_pdf_srb_eng = configRecord.getValue({
              fieldId: 'custrecord_rsm_config_inv_srb_eng_pdf'
            });

            if (pdfBothLanguages) {
              renderer.setTemplateByScriptId(invoice_pdf_srb_eng);
            } else if (custCountry === 'RS' || custCountry === '' || custCountry === 'ME' || custCountry === 'BA' || custCountry === 'HR') {
              renderer.setTemplateByScriptId(invoice_pdf_rs)
            } else {
              renderer.setTemplateByScriptId(invoice_pdf_ino)
            }

            if (linkedInvoice) {
              var knjizno_zaduzenje_pdf = configRecord.getValue({
                fieldId: 'custrecord_rsm_config_kz_pdf'
              });
              renderer.setTemplateByScriptId(knjizno_zaduzenje_pdf);
            }
            var pdfFile = renderer.renderAsPdf();
          } catch (error) {
            log.error('Error', "Error message: " + error);
            message = {
              type: 'error',
              title: 'Greska!',
              message: "Molimo vas da podesite PDF Template Fields unutar Subsidiary config-a za subsidiary sa transakcije."
            };
            return {
              message: message
            };
          }
          // Delete the old pdf file if it already exists
          var olfFileId = invoiceRec.getValue('custbody_cust_dep_pdf_file');
          if (olfFileId) {
            file.delete({
              id: olfFileId
            });
            log.audit('Success', 'Old pdf file deleted!');
          }

          // Save a new pdf file to file cabinet and add it to the cust dep form
          var newPdfFile = file.create({
            name: "PDF faktura - invoice:" + requestBody.invoiceId,
            fileType: file.Type.PDF,
            contents: pdfFile.getContents(),
            folder: file.load({
              id: './pdf_files/flagfile'
            }).folder
          });
          var newPdfFileId = newPdfFile.save();
          log.audit('Success', "New pdf file created! ID:" + newPdfFileId);

          invoiceRec.setValue({
            fieldId: 'custbody_cust_dep_pdf_file',
            value: newPdfFileId
          });
          invoiceRec.save();

          message = {
            type: 'confirmation',
            title: 'Uspesno!',
            message: "PDF faktura za invoice " + requestBody.invoiceId + " je uspesno kreirana! Osvezite stranicu.",
            duration: '0'
          };

        } catch (error) {
          log.error('Error', "Error message: " + error);
          if (!message) {
            message = {
              type: 'error',
              title: 'Greska!',
              message: "Doslo je do greske prilikom kreiranja PDF fakture! Proverite log restlet skripte."
            };
          }
        }
      }

      if (requestBody.action === 'emailpdf') {
        try {
          var invoiceRec = record.load({
            type: record.Type.INVOICE,
            id: requestBody.invoiceId
          });

          // Get file from customer deposit record
          var pdfFileId = invoiceRec.getValue('custbody_cust_dep_pdf_file');
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
            id: invoiceRec.getValue('entity')
          });

          var custCountry = customerRec.getSublistValue({
            sublistId: 'addressbook',
            fieldId: 'country_initialvalue',
            line: 0
          });
          custCountry = (custCountry === 'RS') ? '' : custCountry;
          var locationText = invoiceRec.getText('location');
          // Get customer email - recipient email
          var recipientEmail = getEmailFromCustomer(customerRec, locationText);
          var ccEmailArray = [];
          var bccEmailArray = [];
          var transactionLocationId = invoiceRec.getValue({
            fieldId: 'location'
          });

          var transactionCustomerId = invoiceRec.getValue('entity');

          var transactionCCField = invoiceRec.getText('custbody_rsm_additional_cc_email');

          var transactionBCCField = invoiceRec.getText('custbody_rsm_additional_bcc_email');

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
              message: "Molimo vas da podesite email polje na Customer record-u ili Notification Param record za datog customera!",
              duration: '0'
            };
            return {
              message: message
            };
          }

          var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
            feature: 'SUBSIDIARIES'
          });

          var configRecord, invoice_email_rs, invoice_email_ino;
          if (subsidiaryFeatureCheck) {
            var subsidiaryId = invoiceRec.getValue({
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
          invoice_email_rs = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_invoice_email'
          });
          invoice_email_ino = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_invoice_email_ino'
          });

          var emailTemplateId = ''
          if (custCountry === 'RS' || custCountry === '' || custCountry === 'ME' || custCountry === 'BA' || custCountry === 'HR') {
            emailTemplateId = invoice_email_rs
          } else {
            emailTemplateId = invoice_email_ino;
          }

          if (!emailTemplateId) {
            log.error('Error', "Invoice email template field is empty inside Subsidiary Config.")
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
            query: "SELECT content, subject, mediaitem FROM emailtemplate WHERE scriptid = ?",
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

            var signatureData = getSignatureUser(invoiceRec);
            var websiteClass = getWebsiteClass(invoiceRec);
            var logoUrl = getLogoForEmail(invoiceRec);

            var domain = url.resolveDomain({
              hostType: url.HostType.APPLICATION
            });
            var transactionStatus = invoiceRec.getText('status');
            var isPaidInFull = (transactionStatus === 'Paid In Full') ? true : false;

            var jsonObj = {
              employeeId: signatureData[0],
              employeeEmail: signatureData[1],
              employeeMobilePhone: signatureData[2],
              websiteClass: websiteClass,
              logoUrl: 'https://' + domain + logoUrl.replace(/&/g, '&amp;'),
              isPaidInFull: isPaidInFull
            }
            var emailSender = getEmailSender(invoiceRec);
            emailRender.addCustomDataSource({
              format: render.DataSource.OBJECT,
              alias: "JSON",
              data: jsonObj
            });

            content = emailRender.renderAsString();
          }

          var replyToEmailAddress = getReplyToEmail(configRecord);

          var attachedFiles = [];
          var attachedFilesId = getAttachedFiles(invoiceRec.id, invoiceRec.type);

          attachedFilesId.forEach(function (fileId) {
            var tempPdfFile = file.load({
              id: fileId
            });
            attachedFiles.push(tempPdfFile);
          });

          attachedFiles.push(pdfFile);

          if (replyToEmailAddress === '') {
            email.send({
              author: emailSender, // Internal id of email sender - current user
              body: content, // insert email body as a string
              recipients: recipientEmail, // email of recipient as a string - could be an array of strings also
              cc: ccEmailArray, // array of strings for cc of email
              bcc: bccEmailArray, // array of strings for bcc of email
              subject: emailSubject, // subject as a string
              attachments: attachedFiles, // insert file.File - array
              relatedRecords: {
                entityId: transactionCustomerId,
                transactionId: requestBody.invoiceId
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
              attachments: attachedFiles, // insert file.File - array
              relatedRecords: {
                entityId: transactionCustomerId,
                transactionId: requestBody.invoiceId
              },
              replyTo: replyToEmailAddress
            });
          }

          var emailStatusId = getEmailStatusId('SENT');
          invoiceRec.setValue({
            fieldId: 'custbody_rsm_invoice_email_status',
            value: emailStatusId
          });
          invoiceRec.save();
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
      if (requestBody.action === 'createKnjiznoZaduzenje') {
        try {
          var startingInvoiceRecord = record.load({
            type: record.Type.INVOICE,
            id: requestBody.invoiceId,
            isDynamic: true
          });
        } catch (error) {
          log.error('Error!', "Error during invoice record loading.\nError message: " + error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Greska prilikom kreiranja Knjiznog zaduzenja. Proverite log Restlet skripte!"
          };
          return {
            message: message
          };
        }
        var oldTrandate = startingInvoiceRecord.getValue({
          fieldId: 'trandate'
        });
        var oldDocumentNumber = startingInvoiceRecord.getValue({
          fieldId: 'tranid'
        });

        var knjiznoZaduzenjeRecord = record.copy({
          type: record.Type.INVOICE,
          id: requestBody.invoiceId,
          isDynamic: true
        });

        knjiznoZaduzenjeRecord.setValue({
          fieldId: 'trandate',
          value: oldTrandate
        });
        knjiznoZaduzenjeRecord.setValue({
          fieldId: 'custbody_rsm_kz_linked_invoice_date',
          value: oldTrandate
        });
        knjiznoZaduzenjeRecord.setValue({
          fieldId: 'custbody_rsm_kz_document_number',
          value: 'KZ_' + oldDocumentNumber
        });
        knjiznoZaduzenjeRecord.setValue({
          fieldId: 'custbody_rsm_kz_linked_invoice',
          value: requestBody.invoiceId
        });

        var newInvoiceId = knjiznoZaduzenjeRecord.save();

        var output = url.resolveRecord({
          recordType: record.Type.INVOICE,
          recordId: newInvoiceId,
          isEditMode: true
        });
        message = {
          type: 'confirmation',
          title: 'Uspesno!',
          message: "Knjizno zaduzenje KZ_" + oldDocumentNumber + " je uspesno kreirano!",
          duration: '0'
        };
        
        return {
          linkToRecord: output,
          message: message
        }
      }

      if (requestBody.action === 'createJournal1') {
        var invoiceRec;
        var isCreated = false;
        try {
          // Load invoice record and overwrite the variable
          invoiceRec = record.load({
            type: record.Type.INVOICE,
            id: requestBody.invoiceId
          });
        } catch (error) {
          log.error('Error!', "Error during invoice record loading.\nError message: " + error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Greska prilikom kreiranja JE transakcije. Proverite log Restlet skripte!"
          };
          return {
            message: message
          };
        }

        try {
          var amount = parseFloat(invoiceRec.getValue('subtotal'));
          var taxAmount = parseFloat(invoiceRec.getValue('taxtotal'));
          var currency = invoiceRec.getValue('currency');
          var popdvDate = invoiceRec.getValue('custbody_popdv_datum');
          var brojPotvrde = invoiceRec.getValue('custbody_br_potvrde_poresko_oslob');
          var customer = invoiceRec.getValue('entity');
          var customerName = invoiceRec.getText('entity');
          var tranId = invoiceRec.getValue('tranid');
          var departmentId = invoiceRec.getValue('department');
          var classId = invoiceRec.getValue('class');
          var locationId = invoiceRec.getValue('location');
          var taxCodeId = invoiceRec.getSublistValue({
            sublistId: 'item',
            fieldId: 'taxcode',
            line: 0
          });
          // Load tax code record and get it's opposite tax code id
          var taxCode = record.load({
            type: record.Type.SALES_TAX_ITEM,
            id: taxCodeId
          });
          var oppositeTaxCode1Id = taxCode.getValue('custrecord_rsm_opposite_tax_code');
          // Load opposite tax code record
          var oppositeTaxCode1 = record.load({
            type: record.Type.SALES_TAX_ITEM,
            id: oppositeTaxCode1Id
          });
          // Get sales tax account description and id from opposite tax code
          var oppositeTaxCode1SalesTaxAccount = oppositeTaxCode1.getValue('acct2');
          var accResultSet = query.runSuiteQL({
            query: "SELECT id, accountsearchdisplaynamecopy FROM account WHERE accountsearchdisplaynamecopy = ?",
            params: [oppositeTaxCode1SalesTaxAccount]
          });
          // Get id here
          var line3Acc = accResultSet.results[0].values[0];

          var oppositeTaxCodeRate = oppositeTaxCode1.getValue('rate');
          try {
            oppositeTaxCodeRate = parseInt(oppositeTaxCodeRate.replace(/%/g, ''));
          } catch (error) {
          }
          var line3TaxAmount = amount * oppositeTaxCodeRate / 100;

          // Create and save Journal Entry here
          // Create JE record
          var jeRec = record.create({
            type: record.Type.JOURNAL_ENTRY,
            isDynamic: true
          });
          // Try and set subsidiary
          try {
            var subsidiary = invoiceRec.getValue('subsidiary');
            jeRec.setValue({
              fieldId: 'subsidiary',
              value: subsidiary
            });
          } catch (error) {
            log.error('Error!', "Couldn't get subsidiary from invoice!\nError message: " + error);
          }
          // Set currency
          jeRec.setValue({
            fieldId: 'currency',
            value: currency
          });
          // Set trandate
          jeRec.setText({
            fieldId: 'trandate',
            text: popdvDate
          });
          // Set popdv datum field
          jeRec.setText({
            fieldId: 'custbody_popdv_datum',
            text: popdvDate
          });
          // Set custbody_datum_poresko_oslobodjenje
          jeRec.setText({
            fieldId: 'custbody_datum_poresko_oslobodjenje',
            text: popdvDate
          });
          // Set custbody_br_potvrde_poresko_oslob
          jeRec.setValue({
            fieldId: 'custbody_br_potvrde_poresko_oslob',
            value: brojPotvrde
          });
          // Set memo
          jeRec.setText({
            fieldId: 'memo',
            text: customerName + " / Invoice " + tranId
          });

          var generalPreferences = config.load({
            type: config.Type.COMPANY_PREFERENCES
          });
          var accId = generalPreferences.getValue({
            fieldId: 'custscript_rsm_pdv_za_prek_acc_par'
          });

          // Credit line - Line 1
          jeRec.selectNewLine({
            sublistId: 'line'
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'credit',
            value: amount
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: accId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'taxcode',
            value: taxCodeId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: customerName + " / Invoice " + tranId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: customer
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          jeRec.commitLine({
            sublistId: 'line'
          });

          // Debit line - Line 2
          jeRec.selectNewLine({
            sublistId: 'line'
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'debit',
            value: amount
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: accId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'taxcode',
            value: oppositeTaxCode1Id
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: customerName + " / Invoice " + tranId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: customer
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          jeRec.commitLine({
            sublistId: 'line'
          });

          // Credit line - Line 3
          jeRec.selectNewLine({
            sublistId: 'line'
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'credit',
            value: line3TaxAmount
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: line3Acc
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: customerName + " / Invoice " + tranId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: customer
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          jeRec.commitLine({
            sublistId: 'line'
          });
          recId = jeRec.save();
          log.audit('Success', "Generated journal transaction with id: " + recId);

          // Add JE link to appropriate field in invoice
          invoiceRec.setValue({
            fieldId: 'custbody_rsm_linked_je_wo_ack',
            value: recId
          });
          invoiceRec.save();

          message = {
            type: 'confirmation',
            title: 'Confirmation',
            message: "Journal transakcija je uspesno kreirana! ID:" + recId + ". Automatsko osvezavanje stranice za 5s!",
            duration: '0'
          }
          isCreated = true;
          // Response object
          return {
            isCreated: isCreated,
            journalId: recId,
            message: message
          };
        } catch (error) {
          log.error('Error!', "Error during JE creation.\nError message: " + error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Greska prilikom kreiranja JE transakcije. Proverite log Restlet skripte!"
          };
          return {
            message: message
          };
        }
      }

      if (requestBody.action === 'createJournal2') {
        var invoiceRec;
        var isCreated = false;
        var d = requestBody.datumPotvrde.split('-');
        var datumPotvrde = dUtil.createNewDateString(d[2], d[1], d[0]);

        try {
          // Load invoice record and overwrite the variable
          invoiceRec = record.load({
            type: record.Type.INVOICE,
            id: requestBody.invoiceId
          });
        } catch (error) {
          log.error('Error!', "Error during invoice record loading.\nError message: " + error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Greska prilikom kreiranja JE transakcije. Proverite log Restlet skripte!"
          };
          return {
            message: message
          };
        }

        try {
          var amount = parseFloat(invoiceRec.getValue('subtotal'));
          var taxAmount = parseFloat(invoiceRec.getValue('taxtotal'));
          var currency = invoiceRec.getValue('currency');
          var popdvDate = invoiceRec.getValue('custbody_popdv_datum');
          var customer = invoiceRec.getValue('entity');
          var customerName = invoiceRec.getText('entity');
          var tranId = invoiceRec.getValue('tranid');
          var departmentId = invoiceRec.getValue('department');
          var classId = invoiceRec.getValue('class');
          var locationId = invoiceRec.getValue('location');
          var taxCodeId = invoiceRec.getSublistValue({
            sublistId: 'item',
            fieldId: 'taxcode',
            line: 0
          });
          // Load tax code record and get it's opposite tax code id
          var taxCode = record.load({
            type: record.Type.SALES_TAX_ITEM,
            id: taxCodeId
          });
          var oppositeTaxCode1Id = taxCode.getValue('custrecord_rsm_opposite_tax_code');
          // Load opposite tax code record
          var oppositeTaxCode1 = record.load({
            type: record.Type.SALES_TAX_ITEM,
            id: oppositeTaxCode1Id
          });
          var oppositeTaxCode2Id = oppositeTaxCode1.getValue('custrecord_rsm_opposite_tax_code');
          var oppositeTaxCode2 = record.load({
            type: record.Type.SALES_TAX_ITEM,
            id: oppositeTaxCode2Id
          })
          // Get sales tax account description and id from opposite tax code
          var oppositeTaxCode1SalesTaxAccount = oppositeTaxCode2.getValue('acct2');
          var accResultSet = query.runSuiteQL({
            query: "SELECT id, accountsearchdisplaynamecopy FROM account WHERE accountsearchdisplaynamecopy = ?",
            params: [oppositeTaxCode1SalesTaxAccount]
          });
          // Get id here
          var line3Acc = accResultSet.results[0].values[0];

          var oppositeTaxCodeRate = oppositeTaxCode1.getValue('rate');
          try {
            oppositeTaxCodeRate = parseInt(oppositeTaxCodeRate.replace(/%/g, ''));
          } catch (error) {
          }
          var line3TaxAmount = amount * oppositeTaxCodeRate / 100;

          // Create and save Journal Entry here
          // Create JE record
          var jeRec = record.create({
            type: record.Type.JOURNAL_ENTRY,
            isDynamic: true
          });
          // Try and set subsidiary
          try {
            var subsidiary = invoiceRec.getValue('subsidiary');
            jeRec.setValue({
              fieldId: 'subsidiary',
              value: subsidiary
            });
          } catch (error) {
            log.error('Error!', "Couldn't get subsidiary from invoice!\nError message: " + error);
          }
          // Set currency
          jeRec.setValue({
            fieldId: 'currency',
            value: currency
          });
          // Set trandate
          jeRec.setText({
            fieldId: 'trandate',
            text: datumPotvrde
          });
          // Set popdv datum field
          jeRec.setText({
            fieldId: 'custbody_popdv_datum',
            text: datumPotvrde
          });
          // Set custbody_datum_poresko_oslobodjenje
          jeRec.setText({
            fieldId: 'custbody_datum_poresko_oslobodjenje',
            text: datumPotvrde
          });
          // Set custbody_br_potvrde_poresko_oslob
          jeRec.setValue({
            fieldId: 'custbody_br_potvrde_poresko_oslob',
            value: requestBody.brojPotvrde
          });
          // Set memo
          jeRec.setText({
            fieldId: 'memo',
            text: customerName + " / Invoice " + tranId
          });

          var generalPreferences = config.load({
            type: config.Type.COMPANY_PREFERENCES
          });
          var accId = generalPreferences.getValue({
            fieldId: 'custscript_rsm_pdv_za_prek_acc_par'
          });

          // Debit line - Line 1
          jeRec.selectNewLine({
            sublistId: 'line'
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'debit',
            value: amount
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: accId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'taxcode',
            value: taxCodeId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: customerName + " / Invoice " + tranId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: customer
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          jeRec.commitLine({
            sublistId: 'line'
          });

          // Credit line - Line 2
          jeRec.selectNewLine({
            sublistId: 'line'
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'credit',
            value: amount
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: accId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'taxcode',
            value: oppositeTaxCode2Id
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: customerName + " / Invoice " + tranId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: customer
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'department',
            value: departmentId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'class',
            value: classId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'location',
            value: locationId
          });
          jeRec.commitLine({
            sublistId: 'line'
          });

          // Debit line - Line 3
          jeRec.selectNewLine({
            sublistId: 'line'
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'debit',
            value: line3TaxAmount
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            value: line3Acc
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'memo',
            value: customerName + " / Invoice " + tranId
          });
          jeRec.setCurrentSublistValue({
            sublistId: 'line',
            fieldId: 'entity',
            value: customer
          });
          jeRec.commitLine({
            sublistId: 'line'
          });
          recId = jeRec.save();
          log.audit('Success', "Generated journal transaction with id: " + recId);

          // Add JE link to appropriate field in invoice
          invoiceRec.setValue({
            fieldId: 'custbody_linked_journal_entry',
            value: recId
          });
          // Add date to custbody_datum_poresko_oslobodjenje field
          invoiceRec.setText({
            fieldId: 'custbody_datum_poresko_oslobodjenje',
            text: datumPotvrde
          });
          // Add value to custbody_br_potvrde_poresko_oslob field
          invoiceRec.setValue({
            fieldId: 'custbody_br_potvrde_poresko_oslob',
            value: requestBody.brojPotvrde
          });
          invoiceRec.save();

          message = {
            type: 'confirmation',
            title: 'Confirmation',
            message: "Journal transakcija je uspesno kreirana! ID:" + recId + ". Automatsko osvezavanje stranice za 5s!",
            duration: '0'
          }
          isCreated = true;
          // Response object
          return {
            isCreated: isCreated,
            journalId: recId,
            message: message
          };
        } catch (error) {
          log.error('Error!', "Error during JE creation.\nError message: " + error);
          message = {
            type: 'error',
            title: 'Greska!',
            message: "Greska prilikom kreiranja JE transakcije. Proverite log Restlet skripte!"
          };
          return {
            message: message
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