/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/query', 'N/runtime', 'N/log', './dateUtil.js', 'N/config'],
  function (record, query, runtime, log, dateUtil, config) {

    var dUtil = dateUtil.dateUtil;

    /**
     * Returns opposite tax code from a tax code with passed id
     * @param {number} taxCodeId 
     * @returns {number} returns id of an opposite tax code or null
     */
    function _getOppositeTaxCode(taxCodeId) {
      var tcRec = record.load({
        type: record.Type.SALES_TAX_ITEM,
        id: taxCodeId
      });
      var otc = tcRec.getValue('custrecord_rsm_opposite_tax_code');
      return (otc) ? otc : null;
    }

    /**
     * Creates new Journal Entry transaction and returns it's internal id
     * @param {object} params
     * @param {number} params.amount amount value from bill's expense sublist line
     * @param {number} params.accountId account id from bill's expense sublist line
     * @param {number} params.taxCodeId taxcode id from bill's expense sublist line
     * @param {number} params.departmentId department id from bill's expense sublist line
     * @param {number} params.classId class id from bill's expense sublist line
     * @param {number} params.locationId location id from bill's expense sublist line
     * @param {number} params.currency currency value from bill's main line
     * @param {string} params.tranId transaction id value from bill's main line
     * @param {string} params.tranDate trandate value from bill's main line
     * @param {string} params.dueDate duedate value from bill's main line
     * @param {string} params.popdvDate popdvdate value from bill's main line
     * @param {string} params.vendorName vendor name from bill
     * @param {number} params.subsidiary internal id of a subsidiary or null
     * @param {number} params.je flag which determines which JE this function should create
     * @returns {number} internal id of a newly created Journal Entry tran. record
     */
    function _createJE(params) {
      var jeRec = record.create({
        type: record.Type.JOURNAL_ENTRY,
        isDynamic: true
      });
      // Set subsidiary if feature is enabled (subsidiary not null)
      if (params.subsidiary) {
        jeRec.setValue({
          fieldId: 'subsidiary',
          value: params.subsidiary
        });
      }
      jeRec.setValue({
        fieldId: 'currency',
        value: params.currency
      });
      // Set trandate
      jeRec.setText({
        fieldId: 'trandate',
        text: params.tranDate
      });
      // Set popdv datum field
      jeRec.setText({
        fieldId: 'custbody_popdv_datum',
        text: params.popdvDate
      });
      jeRec.setText({
        fieldId: 'memo',
        text: params.vendorName + " / Bill:" + params.tranId
      });

      // Credit line
      jeRec.selectNewLine({
        sublistId: 'line'
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: (params.je === 1) ? 'credit' : 'debit',
        value: params.amount
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: params.accountId
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'taxcode',
        value: params.taxCodeId
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        value: params.vendorName + " / Bill:" + params.tranId
      });

      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'department',
        value: params.departmentId
      });

      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'class',
        value: params.classId
      });

      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'location',
        value: params.locationId
      })

      jeRec.commitLine({
        sublistId: 'line'
      });

      // Debit line
      jeRec.selectNewLine({
        sublistId: 'line'
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: (params.je === 1) ? 'debit' : 'credit',
        value: params.amount
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: params.accountId
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'taxcode',
        value: params.oppositeTaxCode
      });
      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        value: params.vendorName + " / Bill:" + params.tranId
      });

      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'department',
        value: params.departmentId
      });

      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'class',
        value: params.classId
      });

      jeRec.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'location',
        value: params.locationId
      })

      jeRec.commitLine({
        sublistId: 'line'
      });

      var id = jeRec.save();
      return id;
    }

    function post(requestBody) {
      if (requestBody.action === 'createJournal') {
        var message, isCreated = false, amount;

        var billRec = record.load({
          type: record.Type.VENDOR_BILL,
          id: requestBody.billId,
          isDynamic: true
        });

        var generalPreferences = config.load({
          type: config.Type.COMPANY_PREFERENCES
        });
        var accountId = generalPreferences.getValue({
          fieldId: 'custscript_rsm_bill_account_parameter'
        });

        // Query to get taxcode id of CUSTS-RS tax code
        var undefTaxCodeQuery = query.runSuiteQL({
          query: "SELECT id FROM salestaxitem WHERE description = ?",
          params: ["Uvoz dobara stavljenih u slobodan promet u skladu sa carinskim propisima"]
        });
        var taxCodeId = undefTaxCodeQuery.results[0].values[0];

        // Go through the sublist lines and check if line with accountId and taxCodeId exists
        var createJE = false;
        var lineCount = billRec.getLineCount({
          sublistId: 'expense'
        });
        for (var i = 0; i < lineCount; i++) {
          var testAccountId = billRec.getSublistValue({
            sublistId: 'expense',
            fieldId: 'account',
            line: i
          });
          var testTaxCodeId = billRec.getSublistValue({
            sublistId: 'expense',
            fieldId: 'taxcode',
            line: i
          });
          var departmentId = billRec.getSublistValue({
            sublistId: 'expense',
            fieldId: 'department',
            line: i
          });
          var classId = billRec.getSublistValue({
            sublistId: 'expense',
            fieldId: 'class',
            line: i
          });
          var locationId = billRec.getSublistValue({
            sublistId: 'expense',
            fieldId: 'location',
            line: i
          });

          if (testAccountId == accountId && testTaxCodeId == taxCodeId) {
            // Set createJE flag to true
            createJE = true;
            // Get amount value
            amount = parseFloat(billRec.getSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              line: i
            }));
            break;
          }
        }

        if (createJE) {
          // Get other necessary field values
          var tranDate, dueDate, popdvDate, subsidiary = null,
            tranId = billRec.getValue('tranid'),
            vendorName = billRec.getText('entity'),
            currency = billRec.getValue('currency');

          // Check if subsidiaries feature is enabled then get subsidiary from bill if it is
          var subsidiaryFeatureEnabled = runtime.isFeatureInEffect({
            feature: 'SUBSIDIARIES'
          });
          if (subsidiaryFeatureEnabled) {
            subsidiary = billRec.getValue('subsidiary');
          }


          if (requestBody.je === 1) {
            tranDate = billRec.getValue('trandate');
            dueDate = billRec.getValue('duedate');
            popdvDate = billRec.getValue('custbody_popdv_datum');
          } else {
            var d = requestBody.date.split('-');
            var date = dUtil.createNewDateString(d[2], d[1], d[0]);
            tranDate = date;
            dueDate = date;
            popdvDate = date;
          }
          var oppositeTaxCode = _getOppositeTaxCode(taxCodeId);

          try {
            var id = _createJE({
              amount: amount,
              accountId: accountId,
              taxCodeId: taxCodeId,
              departmentId: departmentId,
              classId: classId,
              locationId: locationId,
              oppositeTaxCode: oppositeTaxCode,
              tranDate: tranDate,
              dueDate: dueDate,
              popdvDate: popdvDate,
              tranId: tranId,
              vendorName: vendorName,
              subsidiary: subsidiary,
              currency: currency,
              je: requestBody.je
            });
            if (id) {
              log.audit("JE created!", "JE transaction with id " + id + " successfully created");
              isCreated = true;
              message = {
                type: 'confirmation',
                title: 'Uspesno!',
                message: "JE transakcija " + id + " je uspesno kreirana! Automatsko osvezavanje stranice za 5s...",
                duration: 0
              }

              try {
                // Set appropriate linked journal entry field
                (requestBody.je === 1) ?
                  billRec.setValue({
                    fieldId: 'custbody_rsm_linked_je_wo_ack',
                    value: id
                  }) :
                  billRec.setValue({
                    fieldId: 'custbody_linked_journal_entry',
                    value: id
                  });
                billRec.save();
              } catch (error) {
                log.error("Couldn't set linked JE fields on a bill!", error);
              }


            } else {
              log.error("Error while creating JE transaction", "ID of a new JE rec not returned!");
              message = {
                type: 'error',
                title: 'Greska!',
                message: "Doslo je do greske prilikom kreiranja JE transakcije! Proverite log restlet skripte."
              }
            }
          } catch (error) {
            log.error("Error while creating JE transaction", error);
            message = {
              type: 'error',
              title: 'Greska!',
              message: "Doslo je do greske prilikom kreiranja JE transakcije! Proverite log restlet skripte."
            }
          }
        } else {
          // Set appropriate message - JE won't be created
          log.audit('Warning!', "User tried to create JE without mandatory lines in bill's expense sublist!");
          message = {
            type: 'warning',
            title: 'Paznja!',
            message: "Bill ne sadrzi liniju sa kontom CARINSKA OSNOVICA! Akcija je obustavljena."
          }
        }

        return {
          isCreated: isCreated,
          message: message
        }

      } else {
        return {
          message: {
            type: 'information',
            title: 'Info',
            message: "Action is not 'createJournal'!"
          }
        }
      }
    }

    return {
      post: post
    };

  });
