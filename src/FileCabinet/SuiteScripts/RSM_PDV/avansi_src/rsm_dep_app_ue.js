/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * 
 * 
 * 
 */
define(['N/log', 'N/search', 'N/record', 'N/format'], function (log, search, record, format) {

    // beforeSubmit entry-point function
    function afterSubmit(context) {
        if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
            var depAppRec = context.newRecord;
            var depAppRecId = context.newRecord.id;
            var lineCount = depAppRec.getLineCount({
                sublistId: 'apply'
            });
            for (var i = 0; i < lineCount; i++) {
                if (depAppRec.getSublistValue('apply', 'apply', i)) {
                    var invoiceApplyDate = depAppRec.getSublistValue('apply', 'applydate', i);
                    var invoiceInternalId = depAppRec.getSublistValue('apply', 'internalid', i);
                    var invoiceLookup = search.lookupFields({
                        type: search.Type.TRANSACTION,
                        id: invoiceInternalId,
                        columns: ['trandate']
                    });
                    log.debug("Invoice Apply Date:", invoiceApplyDate);
                    log.debug("Invoice Tran Date:", invoiceLookup.trandate);
                    var recordToChange = record.load({
                        type: record.Type.DEPOSIT_APPLICATION,
                        id: depAppRecId,
                        isDymamic: true
                    });
                    var tranDate = format.format({
                        value: invoiceLookup.trandate,
                        type: format.Type.DATE
                    });
                    recordToChange.setValue({
                        fieldId: 'trandate',
                        value: tranDate
                    });
                    recordToChange.save();
                }
            }
        }
    }
    return {
      afterSubmit: afterSubmit
    }
});