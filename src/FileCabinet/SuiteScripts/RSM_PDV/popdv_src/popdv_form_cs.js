/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 */
define(['N/currentRecord', 'N/ui/message', 'N/url', 'N/https', 'N/search', 'N/record'], function(currentRecord, message, url, https, search, record) {

  function pageInit(scriptContext) {
    var currRecord = currentRecord.get();
    var subsidiaryId = currRecord.getValue({
      fieldId: 'custpage_subsidiary'
    });
    if (subsidiaryId) {
      var subsidiaryRecord = record.load({
        type: record.Type.SUBSIDIARY,
        id: subsidiaryId,
        isDynamic: true
      });
      var pib = subsidiaryRecord.getValue('federalidnumber');
      if (pib) {
        currRecord.setValue({
          fieldId: 'custpage_pib',
          value: pib,
        });
      }
    }
  }

  function fieldChanged(scriptContext) {
    if (scriptContext.fieldId === 'custpage_subsidiary') {
      var formRecord = scriptContext.currentRecord;
      var subsidiaryId = formRecord.getValue({
        fieldId: 'custpage_subsidiary'
      });
      if (subsidiaryId) {
        var subsidiaryRecord = record.load({
          type: record.Type.SUBSIDIARY,
          id: subsidiaryId,
          isDynamic: true
        })
        var pib = subsidiaryRecord.getValue('custrecord_rsm_vat_reg_no')
        formRecord.setValue({
          fieldId: 'custpage_pib',
          value: pib,
        });
      }
    }
  }

  return {
    pageInit: pageInit,
    fieldChanged: fieldChanged
  }
})