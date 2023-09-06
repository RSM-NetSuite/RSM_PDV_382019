/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * 
 * 
 */
define(['N/record', 'N/query', 'N/log', 'N/ui/serverWidget', 'N/search', 'N/runtime'], function (record, query, log, serverWidget, search, runtime) {

  function beforeSubmit(context) {
    if (context.type === context.UserEventType.EDIT) {
      var transactionRecord = context.newRecord;
      var isReverseCharge = false;
      var transactionId = transactionRecord.getValue({
        fieldId: 'transactionnumber'
      });

      var itemLineCount = transactionRecord.getLineCount({
        sublistId: 'item'
      });

      var expenseLineCount = transactionRecord.getLineCount({
        sublistId: 'expense'
      });

      for (var i = 0; i < itemLineCount; i++) {
        var currentTaxCodeId = transactionRecord.getSublistValue({
          sublistId: 'item',
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
            isReverseCharge = true;
            break;
          }
        }
      }
      for (var j = 0; j < expenseLineCount; j++) {
        var currentTaxCodeId = transactionRecord.getSublistValue({
          sublistId: 'expense',
          fieldId: 'taxcode',
          line: j
        });
        if (currentTaxCodeId) {
          var taxCodeLookup = search.lookupFields({
            type: search.Type.SALES_TAX_ITEM,
            id: currentTaxCodeId,
            columns: ['isreversecharge']
          });

          if (taxCodeLookup.isreversecharge) {
            isReverseCharge = true;
            break;
          }
        }
      }
      if (isReverseCharge) {
        var currentScript = runtime.getCurrentScript();
        var prefix = currentScript.getParameter({
          name: 'custscript_io_bill_prefix'
        });
        transactionRecord.setValue({
          fieldId: 'custbody_rsm_io_counter',
          value: prefix + '_' + transactionId
        });
      } else {
        transactionRecord.setValue({
          fieldId: 'custbody_rsm_io_counter',
          value: ''
        });
      }
    }
  }

  function afterSubmit(context) {
    if (context.type === context.UserEventType.CREATE) {
      var transactionRecordId = context.newRecord.id;
      var isReverseCharge = false;
      var transactionRecord = record.load({
        type: record.Type.VENDOR_BILL,
        id: transactionRecordId,
        isDynamic: true
      });
      var transactionId = transactionRecord.getValue({
        fieldId: 'transactionnumber'
      });
      var itemLineCount = transactionRecord.getLineCount({
        sublistId: 'item'
      });

      var expenseLineCount = transactionRecord.getLineCount({
        sublistId: 'expense'
      });

      for (var i = 0; i < itemLineCount; i++) {
        var currentTaxCodeId = transactionRecord.getSublistValue({
          sublistId: 'item',
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
            isReverseCharge = true;
            break;
          }
        }
      }
      for (var j = 0; j < expenseLineCount; j++) {
        var currentTaxCodeId = transactionRecord.getSublistValue({
          sublistId: 'expense',
          fieldId: 'taxcode',
          line: j
        });
        if (currentTaxCodeId) {
          var taxCodeLookup = search.lookupFields({
            type: search.Type.SALES_TAX_ITEM,
            id: currentTaxCodeId,
            columns: ['isreversecharge']
          });

          if (taxCodeLookup.isreversecharge) {
            isReverseCharge = true;
            break;
          }
        }
      }
      if (isReverseCharge) {
        var currentScript = runtime.getCurrentScript();
        var prefix = currentScript.getParameter({
          name: 'custscript_io_bill_prefix'
        });
        transactionRecord.setValue({
          fieldId: 'custbody_rsm_io_counter',
          value: prefix +'_' + transactionId
        });
      } else {
        transactionRecord.setValue({
          fieldId: 'custbody_rsm_io_counter',
          value: ''
        });
      }
      transactionRecord.save();
    }
  }

  function beforeLoad(context) {
    if (context.type === context.UserEventType.VIEW) {
      var form = context.form;
      form.clientScriptModulePath = "./rsm_interni_obracun_cs.js";

      var transactionRecord = context.newRecord;
      var ioCounter = transactionRecord.getValue({
        fieldId: 'custbody_rsm_io_counter'
      });
      var ioField = form.getField({
        id: 'custbody_rsm_io_counter'
      });
      var btn1 = form.addButton({
        id: 'custpage_create_interni_obracun',
        label: "Kreiraj interni obracun",
        functionName: 'createBillIO'
      });
      if (ioCounter) {
        btn1.isHidden = false;
        ioField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.READONLY
        });
      } else {
        btn1.isHidden = true;
        ioField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        });
      }
    }

    if (context.type === context.UserEventType.EDIT || context.type === context.UserEventType.CREATE) {
      var form = context.form;
      var transactionRecord = context.newRecord;
      var ioCounter = transactionRecord.getValue({
        fieldId: 'custbody_rsm_io_counter'
      });
      var ioField = form.getField({
        id: 'custbody_rsm_io_counter'
      });
      if (ioCounter) {
        ioField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.DISABLED
        });
      } else {
        ioField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        });
      }

    }
  }

  return {
    beforeLoad: beforeLoad,
    beforeSubmit: beforeSubmit,
    afterSubmit: afterSubmit
  };

});