/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/render', 'N/config', 'N/runtime', 'N/file', 'N/query', 'N/url', 'N/email', 'N/log', 'N/search', './dateUtil.js'],
  function (record, render, config, runtime, file, query, url, email, log, search, dateUtil) {

    var dUtil = dateUtil.dateUtil;
    var message = null;
    var CURRENCIES = ['EUR', 'USD', 'CHF']; // foreign currencies in netsuite


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
      } catch (error) { }
      try {
        decimalPart = value.match(/\..+/g)[0];
        value = value.replace(decimalPart, '');
      } catch (error) { }

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

    function post(requestBody) {
      var user = runtime.getCurrentUser();
      var userName = user.name;
      var userId = user.id;
      var userEmail = user.email;

      if (requestBody.action === 'createjournalio') {
        try {
          try {
            //Load bill record
            var journalRecord = record.load({
              type: record.Type.JOURNAL_ENTRY,
              id: requestBody.transactionId
            });
          } catch (error) {
            log.error('Error!', error);
            message = {
              type: 'error',
              title: 'Greska',
              message: "Doslo je do greske prilikom kreiranja PDF internog obracuna! Proverite log restlet skripte!",
              duration: '0'
            };
            return {
              message: message
            };
          }

          var currencyRec = record.load({
            type: record.Type.CURRENCY,
            id: journalRecord.getValue('currency')
          });
          var journalCurrency = currencyRec.getValue('symbol');
          var currencyDisplaySymbol = currencyRec.getValue('displaysymbol');

          var currencyAppend = (currencyDisplaySymbol) ? currencyDisplaySymbol : journalCurrency;

          var lineCount = journalRecord.getLineCount({
            sublistId: 'line'
          });

          var expensesAmount = 0,
            expensesTaxAmount = 0,
            expensesGrossAmount = 0;

          var expenses = [];
          var isExpenses = false;
          var vendorNameId = '';
          for (var i = 0; i < lineCount; i++) {

            var currentTaxCodeId = journalRecord.getSublistValue({
              sublistId: 'line',
              fieldId: 'taxcode',
              line: i
            });
            if (currentTaxCodeId) {
              var taxCodeLookup = search.lookupFields({
                type: search.Type.SALES_TAX_ITEM,
                id: currentTaxCodeId,
                columns: ['isreversecharge']
              });

              if (taxCodeLookup.isreversecharge) {
                isExpenses = true;
                var taxCodeRCRecord = record.load({
                  type: record.Type.SALES_TAX_ITEM,
                  id: currentTaxCodeId,
                  isDynamic: true
                });
                var parentTaxCodeId = taxCodeRCRecord.getValue({
                  fieldId: 'parent'
                });
                var parentTaxCodeLookup = search.lookupFields(({
                  type: search.Type.SALES_TAX_ITEM,
                  id: parentTaxCodeId,
                  columns: ['rate']
                }));
                var parentTaxRate = parseFloat(parentTaxCodeLookup.rate);
                vendorNameId = journalRecord.getSublistValue({
                  sublistId: 'line',
                  fieldId: 'entity',
                  line: i
                });

                try {
                  var vendorName = '',
                    vendorCompany = '',
                    vendorAddress = '',
                    vendorPhone = '',
                    vendorPib = '',
                    vendorMaticniBroj = '';

                  var vendorRec = record.load({
                    type: record.Type.VENDOR,
                    id: vendorNameId
                  });
                  var vendorCountry = vendorRec.getSublistValue({
                    sublistId: 'addressbook',
                    fieldId: 'country_initialvalue',
                    line: 0
                  });
                  vendorName = vendorRec.getValue('companyname');
                  vendorCompany = vendorRec.getValue('companyname');
                  vendorAddress = vendorRec.getValue('defaultaddress');
                  vendorPhone = vendorRec.getValue('phone');
                  vendorPib = vendorRec.getValue('custentity_pib');
                  vendorMaticniBroj = vendorRec.getValue('custentity_matbrpred');
                  var vendAddress = vendorRec.getSublistValue({
                    sublistId: 'addressbook',
                    fieldId: 'addr1_initialvalue',
                    line: 0
                  });
                  var vendCity = vendorRec.getSublistValue({
                    sublistId: 'addressbook',
                    fieldId: 'city_initialvalue',
                    line: 0
                  });
                  var vendCountry = vendorRec.getSublistValue({
                    sublistId: 'addressbook',
                    fieldId: 'country_initialvalue',
                    line: 0
                  });
                  vendCountry = (vendCountry === 'RS') ? '' : vendCountry;

                  var vendZip = vendorRec.getSublistValue({
                    sublistId: 'addressbook',
                    fieldId: 'zip_initialvalue',
                    line: 0
                  });
                } catch (error) {
                  log.error('Error', 'Failed to load vendor record.');
                }
                var creditAmt = journalRecord.getSublistValue({
                  sublistId: 'line',
                  fieldId: 'credit',
                  line: i
                });

                var debitAmt = journalRecord.getSublistValue({
                  sublistId: 'line',
                  fieldId: 'debit',
                  line: i
                });
                var amt = (!creditAmt || creditAmt === 0) ? debitAmt : creditAmt;
                var taxAmt = amt * parentTaxRate / 100;
                // If currency is not RSD
                if (CURRENCIES.indexOf(journalCurrency) !== -1) {
                  var exchangeRate = journalRecord.getValue('exchangerate');
                  amt *= exchangeRate;
                  taxAmt *= exchangeRate;
                }
                var grsAmt = amt + taxAmt;
                expensesGrossAmount += grsAmt;
                expensesTaxAmount += taxAmt;
                expensesAmount += amt;

                expenses.push({
                  nazivKonta: journalRecord.getSublistText({
                    sublistId: 'line',
                    fieldId: 'account',
                    line: i
                  }),
                  taxRate: parentTaxCodeLookup.rate,
                  amount: formatCurrency(parseFloat(amt).toFixed(2)),
                  taxAmount: formatCurrency(parseFloat(taxAmt).toFixed(2)),
                  grossAmount: formatCurrency(parseFloat(grsAmt).toFixed(2)),
                });
              }
            }
          }
          var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
            feature: 'SUBSIDIARIES'
          });

          var domain, logoUrl, companyName, address, city, phone, emailUrl, website, accountNumber, pib, maticniBroj,
            country, zip;
          if (subsidiaryFeatureCheck) {

            var subsidiaryId = journalRecord.getValue({
              fieldId: 'subsidiary'
            });

            var subsidiaryRecord = record.load({
              type: record.Type.SUBSIDIARY,
              id: subsidiaryId
            });
            var logoIdSubsidiary = subsidiaryRecord.getValue({
              fieldId: 'logo'
            });
            logoUrl = file.load({
              id: logoIdSubsidiary
            }).url;
            domain = url.resolveDomain({
              hostType: url.HostType.APPLICATION
            });
            companyName = subsidiaryRecord.getValue({
              fieldId: 'legalname'
            });
            var addrSubRec = subsidiaryRecord.getSubrecord('mainaddress');

            address = addrSubRec.getValue({
              fieldId: 'addr1'
            });
            city = addrSubRec.getValue({
              fieldId: 'city'
            });
            phone = subsidiaryRecord.getValue({
              fieldId: 'fax'
            });
            country = addrSubRec.getValue({
              fieldId: 'country'
            });
            zip = addrSubRec.getValue({
              fieldId: 'zip'
            });
            emailUrl = subsidiaryRecord.getValue({
              fieldId: 'email'
            });
            website = subsidiaryRecord.getValue({
              fieldId: 'url'
            });
            accountNumber = subsidiaryRecord.getValue({
              fieldId: 'custrecord_subsid_tekuci_racun'
            });
            pib = subsidiaryRecord.getValue({
              fieldId: 'federalidnumber'
            });
            maticniBroj = subsidiaryRecord.getValue({
              fieldId: 'custrecord_subs_mat_broj'
            });
          } else {
            try {
              var companyInfo = config.load({
                type: config.Type.COMPANY_INFORMATION
              });
              var logoIdCompanyInfo = companyInfo.getValue({
                fieldId: 'formlogo'
              });
              if (logoIdCompanyInfo) {
                logoUrl = file.load({
                  id: logoIdCompanyInfo
                }).url;
              } else {
                logoUrl = '';
              }
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
              website = companyInfo.getValue({
                fieldId: 'url'
              });
              accountNumber = '';
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
              website = '';
              pib = '';
              maticniBroj = '';
              log.error('Error', "Couldn't get company information data! Error message:\n" + error);
            }
          }

          var data = {};
          var totalNetAmount = expensesAmount;
          var totalTaxAmount = expensesTaxAmount;
          var totalAmount = totalNetAmount + totalTaxAmount;


          data['expensesNetAmount'] = formatCurrency(totalNetAmount.toFixed(2));
          data['expensesTaxAmount'] = formatCurrency(totalTaxAmount.toFixed(2));
          data['expensesGrossAmount'] = formatCurrency(totalAmount.toFixed(2));

          data.tranid = journalRecord.getValue('tranid');
          data.tranDate = dUtil.getDateFromFormattedDate(dUtil.formatDate(journalRecord.getValue('trandate')));

          data.memo = journalRecord.getValue('memo');
          data.ioTransactionNumber = journalRecord.getValue('custbody_rsm_io_counter');

          data.currency = journalRecord.getText('currency');
          data.transactionCurrency = journalCurrency;

          data.isExpenses = isExpenses;
          data.expenses = expenses;

          data.user = {
            name: userName,
            id: userId
          }

          data.companyInformation = {
            name: companyName,
            address: address,
            city: city,
            phone: phone,
            country: country,
            zip: zip,
            email: emailUrl,
            website: website,
            accountNumber: accountNumber,
            pib: pib,
            maticniBroj: maticniBroj,
            logoUrl: 'https://' + domain + logoUrl.replace(/&/g, '&amp;')
          };

          data.customer = {
            name: vendorName,
            companyName: vendorCompany,
            phone: vendorPhone,
            pib: vendorPib,
            maticniBroj: vendorMaticniBroj,
            address: vendorAddress,
            addrDetails: {
              addrText: vendAddress,
              city: vendCity,
              country: vendCountry,
              zip: vendZip
            }
          };
          var configRecord;
          if (subsidiaryFeatureCheck) {
            configRecord = getConfigRecord(subsidiaryId);
          } else {
            configRecord = getConfigRecordWithoutSubsidiaryFeature()
          }

          var renderer = render.create();
          renderer.addCustomDataSource({
            format: render.DataSource.OBJECT,
            alias: "JSON",
            data: data
          });
          var journal_io_pdf_rs = configRecord.getValue({
            fieldId: 'custrecord_rsm_config_io_pdf'
          })

          renderer.setTemplateByScriptId(journal_io_pdf_rs);

          var pdfFile = renderer.renderAsPdf();

          // Delete the old pdf file if it already exists
          var oldFileId = journalRecord.getValue('custbody_cust_dep_pdf_file');
          if (oldFileId) {
            file.delete({
              id: oldFileId
            });
            log.audit('Success', 'Old pdf file deleted');
          }

          var newPdfFile = file.create({
            name: "PDF Interni Obracun - journal:" + requestBody.transactionId,
            fileType: file.Type.PDF,
            contents: pdfFile.getContents(),
            folder: file.load({
              id: './pdf_files/flagfile'
            }).folder
          });
          var newPdfFileId = newPdfFile.save();
          log.audit('Success', "New pdf file created! ID:" + newPdfFileId);

          journalRecord.setValue({
            fieldId: 'custbody_cust_dep_pdf_file',
            value: newPdfFileId
          });
          journalRecord.save();

          message = {
            type: 'confirmation',
            titple: 'Uspesno!',
            message: "PDF Interni obracun za journal " + requestBody.transactionId + " je uspesno kreiran! Osvezite stranicu",
            duration: '0'
          }
        } catch (error) {
          message = {
            type: 'error',
            titple: 'Greska!',
            message: 'Generisanje PDF internog obracuna je neuspesno! Proverite log skripte!',
            duration: '0'
          };
          log.error('Error!', error);
        }
      }
      return {
        newPdfFileId: newPdfFileId,
        message: message
      };
    }

    return {
      post: post
    }
  });