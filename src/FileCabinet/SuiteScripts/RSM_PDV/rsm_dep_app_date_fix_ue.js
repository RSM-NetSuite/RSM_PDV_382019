/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * @NModuleScope Public
 */
define(['N/log', 'N/search', 'N/format'], function (log, search, format) {

  function beforeSubmit(context) {
    if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
      var currentRecord = context.newRecord; // CURRENT DEPOSIT APPLICATION RECORD
      try {
        var applyNumberOfLines = currentRecord.getLineCount({
          sublistId: 'apply'
        });
        var applyDate = '';
        var popdvDate = '';
        var formattedDate = '';
        if (applyNumberOfLines === 1) { //SLUCAJ DA POSTOJI SAMO JEDAN INVOICE U LISTI
          applyDate = currentRecord.getSublistValue({
            sublistId: 'apply',
            fieldId: 'applydate',
            line: 0
          });
          var transactionId = currentRecord.getSublistValue({
            sublistId: 'apply',
            fieldId: 'internalid',
            line: 0
          });
          var popdvDatumLookUp = search.lookupFields({
            type: search.Type.INVOICE,
            id: transactionId,
            columns: ['custbody_popdv_datum']
          });
          popdvDate = popdvDatumLookUp.custbody_popdv_datum;
          formattedDate = format.parse({
            value : popdvDate,
            type : format.Type.DATE,
            timezone : format.Timezone.EUROPE_BUDAPEST
          })
          currentRecord.setValue({ // Override deposit application date
            fieldId: 'trandate',
            value: applyDate
          });
          currentRecord.setValue({
            fieldId: 'custbody_popdv_datum',
            value: formattedDate
          });
          log.audit('Action!', "Overriding deposit application POPDV date to invoice POPDV date");
          log.audit('Action!', "Overriding deposit application date to invoice trandate.");
        } else if (applyNumberOfLines > 1) { //SLUCAJ DA POSTOJI VISE INVOICE-A U LISTI A SAMO JEDAN CEKIRAN
          var numberOfCheckedInvoices = 0;
          for (var i = 0; i < applyNumberOfLines; i++) {
            var invoiceApplied = currentRecord.getSublistValue({
              sublistId: 'apply',
              fieldId: 'apply',
              line: i
            });
            if (invoiceApplied) {
              applyDate = currentRecord.getSublistValue({
                sublistId: 'apply',
                fieldId: 'applydate',
                line: i
              });
              var transactionId = currentRecord.getSublistValue({
                sublistId: 'apply',
                fieldId: 'internalid',
                line: i
              });
              var popdvDatumLookUp = search.lookupFields({
                type: search.Type.INVOICE,
                id: transactionId,
                columns: ['custbody_popdv_datum']
              });
              
              popdvDate = popdvDatumLookUp.custbody_popdv_datum;

              if (popdvDate) {
                formattedDate = format.parse({
                  value : popdvDate,
                  type : format.Type.DATE,
                  timezone : format.Timezone.EUROPE_BUDAPEST
                });
              } else {
                formattedDate = '';
              }
              numberOfCheckedInvoices++;
            }
          }
          if (numberOfCheckedInvoices === 1) {
            currentRecord.setValue({
              fieldId: 'trandate',
              value: applyDate
            });
            log.audit('Action!', "Overriding deposit application date to invoice trandate.");
            if (formattedDate !== '') {
              currentRecord.setValue({
                fieldId: 'custbody_popdv_datum',
                value: formattedDate
              });
              log.audit('Action!', "Overriding deposit application POPDV date to invoice POPDV date");
            }



          }
        }
      } catch (error) {
        log.error('Error!', "Error occured while overriding deposit application date and POPDV date! ERROR: " + error);
      }
    }
  }

  return {
    beforeSubmit: beforeSubmit
  };

});