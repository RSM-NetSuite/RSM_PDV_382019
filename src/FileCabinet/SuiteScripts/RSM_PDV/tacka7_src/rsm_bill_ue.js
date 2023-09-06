/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * @NModuleScope Public
 */
define(['N/log', 'N/query', 'N/record', 'N/config'], function (log, query, record, config) {

  function beforeLoad(context) {
    if (context.type === context.UserEventType.VIEW) {
      var currRec = context.newRecord;

      var form = context.form;
      form.clientScriptModulePath = './rsm_bill_cs.js';

      // Get linked JE fields to set disabled property of these buttons
      var linkedJE1 = currRec.getValue({
        fieldId: 'custbody_rsm_linked_je_wo_ack'
      });
      var linkedJE2 = currRec.getValue({
        fieldId: 'custbody_linked_journal_entry'
      });

      var btn1 = form.addButton({
        id: 'custpage_rsm_nije_placena_carina',
        label: 'Nije placena carina',
        functionName: 'createJE(' + JSON.stringify({
          billId: currRec.id,
          je: 1,
          btnId: 'custpage_rsm_nije_placena_carina'
        }) + ')',
      });
      if (linkedJE1) {
        btn1.isDisabled = true;
      }
      var btn2 = form.addButton({
        id: 'custpage_rsm_placena_carina',
        label: 'Placena carina',
        functionName: 'createJE(' + JSON.stringify({
          billId: currRec.id,
          je: 2,
          btnId: 'custpage_rsm_placena_carina'
        }) + ')',
      });
      if (!linkedJE1 || linkedJE2) {
        btn2.isDisabled = true;
      }
    }
  }

  function afterSubmit(context) {
    if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
      var currentRecord = context.newRecord;

      var billRecord = record.load({
        type: record.Type.VENDOR_BILL,
        id: currentRecord.id,
        isDynamic: true
      });

      var generalPreferences = config.load({
        type: config.Type.COMPANY_PREFERENCES
      });
      var accountId = generalPreferences.getValue({
        fieldId: 'custscript_rsm_bill_account_parameter'
      });

      //Query to get taxcode id of Undefined tax code
      var undefTaxCodeQuery = query.runSuiteQL({
        query: "SELECT id FROM salestaxitem WHERE description = ?",
        params: ["Used when NetSuite cannot determine the appropriate tax code for a transaction."]
      });
      var undefTaxCodeId = undefTaxCodeQuery.results[0].values[0];

      var numberOfLines = billRecord.getLineCount({
        sublistId: 'expense'
      });
      //To see if line with undefined tax code is already added
      var flag = true;

      for (var j = 0; j < numberOfLines; j++) {
        var testAccountId = billRecord.getSublistValue({
          sublistId: 'expense',
          fieldId: 'account',
          line: j
        });

        var testTaxCodeId = billRecord.getSublistValue({
          sublistId: 'expense',
          fieldId: 'taxcode',
          line: j
        });

        if (testAccountId == accountId && testTaxCodeId == undefTaxCodeId) {
          flag = false;
          break;
        }
      }
      if (flag) {
        for (var i = 0; i < numberOfLines; i++) {

          var accountAtCurrentLine = billRecord.getSublistValue({
            sublistId: 'expense',
            fieldId: 'account',
            line: i
          });

          if (accountAtCurrentLine == accountId) {
            var amount = parseFloat(billRecord.getSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              line: i
            }));
            var departmentId = billRecord.getSublistValue({
              sublistId: 'expense',
              fieldId: 'department',
              line: i
            });
            var classId = billRecord.getSublistValue({
              sublistId: 'expense',
              fieldId: 'class',
              line: i
            });
            var locationId = billRecord.getSublistValue({
              sublistId: 'expense',
              fieldId: 'location',
              line: i
            });
            var amountForNewLine = (-1) * amount;

            billRecord.selectNewLine({
              sublistId: 'expense'
            });

            billRecord.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'account',
              value: accountId
            });

            billRecord.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'amount',
              value: amountForNewLine
            });

            billRecord.setCurrentSublistValue({
              sublistId: 'expense',
              fieldId: 'taxcode',
              value: undefTaxCodeId
            });
            if (departmentId) {
              billRecord.setCurrentSublistValue({
                sublistId: 'expense',
                fieldId: 'department',
                value: departmentId
              });
            }
            if (classId) {
              billRecord.setCurrentSublistValue({
                sublistId: 'expense',
                fieldId: 'class',
                value: classId
              });
            }
            if (locationId) {
              billRecord.setCurrentSublistValue({
                sublistId: 'expense',
                fieldId: 'location',
                value: locationId
              });
            }
            billRecord.commitLine({
              sublistId: 'expense'
            });
            billRecord.save();
            break;
          }
        }
      }
    }
  }

  return {
    beforeLoad: beforeLoad,
    afterSubmit: afterSubmit
  }
});


