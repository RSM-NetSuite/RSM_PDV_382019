/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * @NModuleScope Public
 */
define(['N/config', 'N/record', 'N/search', 'N/log', 'N/runtime', 'N/query'], function (config, record, search, log, runtime, query) {

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
  function getPdfFlag(transactionRecord) {
    var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
      feature: 'SUBSIDIARIES'
    });
    var pdfFlag = true;
    if (subsidiaryFeatureCheck) {
      var subsidiaryId = transactionRecord.getValue({
        fieldId: 'subsidiary'
      });
      try {
        var configRecord = getConfigRecord(subsidiaryId);
      } catch (error) {
        pdfFlag = false;
        return pdfFlag;
      }
      var transactionTemplateSrb = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_pdf'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_pdf_ino'
      });

      if (transactionTemplateSrb === '' && transactionTemplateIno === '') {
        pdfFlag = false;
      }
      return pdfFlag;
    } else {
      try {
        var configRecord = getConfigRecordWithoutSubsidiaryFeature();
      } catch (error) {
        pdfFlag = false;
        return pdfFlag;
      }
      var transactionTemplateSrb = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_pdf'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_pdf_ino'
      });

      if (transactionTemplateSrb === '' && transactionTemplateIno === '') {
        pdfFlag = false;
      }
      return pdfFlag;
    }
  }

  function getEmailFlag(transactionRecord) {
    var subsidiaryFeatureCheck = runtime.isFeatureInEffect({
      feature: 'SUBSIDIARIES'
    });
    var emailFlag = true;
    if (subsidiaryFeatureCheck) {
      var subsidiaryId = transactionRecord.getValue({
        fieldId: 'subsidiary'
      });
      try {
        var configRecord = getConfigRecord(subsidiaryId);
      } catch (error) {
        emailFlag = false;
        return emailFlag;
      }
      var transactionTemplateSrb = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_email'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_email_ino'
      });

      if (transactionTemplateSrb === '' && transactionTemplateIno === '') {
        emailFlag = false;
      }
      return emailFlag;
    } else {
      try {
        var configRecord = getConfigRecordWithoutSubsidiaryFeature();
      } catch (error) {
        emailFlag = false;
        return emailFlag;
      }
      var transactionTemplateSrb = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_email'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cm_email_ino'
      });

      if (transactionTemplateSrb === '' && transactionTemplateIno === '') {
        emailFlag = false;
      }
      return emailFlag;
    }
  }

  function beforeLoad(context) {
    if (context.type === context.UserEventType.VIEW) {
      
      context.form.clientScriptModulePath = './rsm_credit_memo_cs.js';

      var currRecord = context.newRecord;

      var subsidiaryId = currRecord.getValue({
        fieldId: 'subsidiary'
      });

      var jeField = currRecord.getValue('custbody_linked_journal_entry');
      if (!jeField || jeField === '' || jeField === ' ') {
        var thisRec = record.load({
          type: record.Type.CREDIT_MEMO,
          id: currRecord.id,
          isDynamic: true
        });
        thisRec.setText({
          fieldId: 'custbody_datumprometa',
          text: ''
        });
        thisRec.save();
      }

      // Get taxline account id
      var result = search.create({
        type: 'transaction',
        filters: [
          ['internalid', 'is', currRecord.id],
          'AND',
          ['taxline', 'is', 'T']
        ],
        columns: [
          'account'
        ]
      }).run().getRange(0, 1)[0];
      var taxAccountId = result.getValue('account');

      // Get tax code
      var taxCode = currRecord.getSublistValue({
        sublistId: 'item',
        fieldId: 'taxcode',
        line: 0
      });

      // Get tax rate 
      var rate = currRecord.getSublistValue({
        sublistId: 'item',
        fieldId: 'taxrate1',
        line: 0
      });
      rate = (typeof rate === 'string') ? parseInt(rate.replace(/%/g, '')) : rate;

      // Calculate gross, net and tax amounts
      var amount = currRecord.getValue('total');
      var netAmount = amount / (1 + rate / 100)
      var taxAmount =  amount - netAmount;

      // Prepare parameters
      var params = {
        subsidiary: subsidiaryId,
        account: currRecord.getValue('account'),
        taxCode: taxCode,
        rate: rate,
        taxAccountId: taxAccountId,
        amount: amount,
        netAmount: netAmount,
        taxAmount: taxAmount,
        creditMemoId: currRecord.id
      };

      var button = context.form.addButton({
        id: 'custpage_umanjenje_pdv',
        label: "Saglasnost za umanjenje PDV-a",
        functionName: "createJournal(" + JSON.stringify(params) + ")"
      });

      var linkedJournal = currRecord.getValue('custbody_linked_journal_entry');

      if (linkedJournal) {
        button.isDisabled = true;
      }

      var pdfFlag = getPdfFlag(currRecord);
      var emailFlag = getEmailFlag(currRecord);

      if (pdfFlag) {
        // Buttons for generating and emailing pdf document
        var generatePdfBtn = context.form.addButton({
          id: 'custpage_credit_memo_create_pdf',
          label: "Kreiraj PDF dokument",
          functionName: "createCreditMemoPdf(" + JSON.stringify(params) + ")"
        });
      }
      if (emailFlag) {
        var sendPdfViaEmailBtn = context.form.addButton({
          id: 'custpage_credit_memo_email',
          label: "Posalji PDF dokument",
          functionName: "emailCreditMemoPdf(" + JSON.stringify(params) + ")"
        });
      }
    }
  }

  function afterSubmit(context) {
    if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
      var cmRec = record.load({
        type: record.Type.CREDIT_MEMO,
        id: context.newRecord.id
      });
      
      try {
        var invoiceId = cmRec.getValue('createdfrom');
        var invoiceRec = record.load({
          type: record.Type.INVOICE,
          id: invoiceId
        });

        var invoiceTranDate = invoiceRec.getValue('trandate');
        cmRec.setValue({
          fieldId: 'saleseffectivedate',
          value: invoiceTranDate
        });
        cmRec.save();
        log.audit('Action!', "Overriding sales effective date to invoice trandate.");
      } catch (error) {
        log.error('Error!', "Can not find 'created from' invoice!");
      }

    }
  }

  return {
    beforeLoad: beforeLoad,
    afterSubmit: afterSubmit
  };

});