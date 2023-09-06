/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * 
 * 
 * 
 */
define(['N/log', 'N/ui/serverWidget', 'N/ui/message', 'N/record', 'N/runtime', 'N/query'], function (log, serverWidget, message, record, runtime, query) {

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
        fieldId: 'custrecord_rsm_config_invoice_pdf'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_invoice_pdf_ino'
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
        fieldId: 'custrecord_rsm_config_invoice_pdf'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_invoice_pdf_ino'
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
        fieldId: 'custrecord_rsm_config_invoice_email'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_invoice_email_ino'
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
        fieldId: 'custrecord_rsm_config_invoice_email'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_invoice_email_ino'
      });

      if (transactionTemplateSrb === '' && transactionTemplateIno === '') {
        emailFlag = false;
      }
      return emailFlag;
    }
  }

  // BeforeLoad entry-point function
  function beforeLoad(context) {
    if (context.type === context.UserEventType.VIEW) {

      var invoiceRec = context.newRecord;
      var JEBezPotvrde = invoiceRec.getValue({
        fieldId: 'custbody_rsm_linked_je_wo_ack'
      });
      var linkedJE = invoiceRec.getValue({
        fieldId: 'custbody_linked_journal_entry'
      });

      var knjiznoZaduzenjeDocumentNumber = invoiceRec.getValue({
        fieldId: 'custbody_rsm_kz_document_number'
      })
      var knjiznoZaduzenjeLinkedInvoice = invoiceRec.getValue({
        fieldId: 'custbody_rsm_kz_linked_invoice'
      })
      var knjiznoZaduzenjeLinkedInvoiceDate = invoiceRec.getValue({
        fieldId: 'custbody_rsm_kz_linked_invoice_date'
      });

      var form = context.form;
      form.clientScriptModulePath = './rsm_cust_dep_invoice_cs.js';

      var btn1 = form.addButton({
        id: 'custpage_poresko_oslobodjenje_bez_potvrde',
        label: "Bez potvrde",
        functionName: 'createPOJournalEntry1'
      });
      if (JEBezPotvrde) {
        btn1.isDisabled = true;
      }

      var btn2 = form.addButton({
        id: 'custpage_poresko_oslobodjenje',
        label: "Poresko oslobodjenje",
        functionName: 'createPOJournalEntry2'
      });
      if (!JEBezPotvrde || linkedJE) {
        btn2.isDisabled = true;
      }

      var pdfFlag = getPdfFlag(invoiceRec);
      var emailFlag = getEmailFlag(invoiceRec);

      if (pdfFlag) {
        form.addButton({
          id: 'custpage_invoice_create_pdf',
          label: "Kreiraj PDF dokument",
          functionName: 'createInvoicePdf'
        });
      }
      if (emailFlag) {
        form.addButton({
          id: 'custpage_invoice_email',
          label: "Posalji PDF dokument",
          functionName: 'emailInvoicePdf'
        });
      }

      var btn3 = form.addButton({
        id: 'custpage_knjizno_zaduzenje',
        label: 'Kreiraj knjizno zaduzenje',
        functionName: 'createKnjiznoZaduzenje'
      });

      var kzDocumentNumberField = form.getField({
        id: 'custbody_rsm_kz_document_number'
      });
      var kzLinkedInvoiceField = form.getField({
        id: 'custbody_rsm_kz_linked_invoice'
      });
      var kzLinkedInvoiceDateField = form.getField({
        id: 'custbody_rsm_kz_linked_invoice_date'
      });

      if (knjiznoZaduzenjeDocumentNumber && knjiznoZaduzenjeLinkedInvoice && knjiznoZaduzenjeLinkedInvoiceDate) {
        btn3.isHidden = true;

        kzDocumentNumberField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.READONLY
        })
        kzLinkedInvoiceField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.READONLY
        });
        kzLinkedInvoiceDateField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.READONLY
        });
      } else {
        kzDocumentNumberField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        })
        kzLinkedInvoiceField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        });
        kzLinkedInvoiceDateField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        });
      }
      
    } else if (context.type === context.UserEventType.EDIT) {
      var form = context.form;
      var invoiceRec = context.newRecord;

      //GET FIELDS
      var kzDocumentNumberField = form.getField({
        id: 'custbody_rsm_kz_document_number'
      });
      var kzLinkedInvoiceField = form.getField({
        id: 'custbody_rsm_kz_linked_invoice'
      });
      var kzLinkedInvoiceDateField = form.getField({
        id: 'custbody_rsm_kz_linked_invoice_date'
      });

      //GET FIELD VALUES
      var knjiznoZaduzenjeDocumentNumber = invoiceRec.getValue({
        fieldId: 'custbody_rsm_kz_document_number'
      })
      var knjiznoZaduzenjeLinkedInvoice = invoiceRec.getValue({
        fieldId: 'custbody_rsm_kz_linked_invoice'
      })
      var knjiznoZaduzenjeLinkedInvoiceDate = invoiceRec.getValue({
        fieldId: 'custbody_rsm_kz_linked_invoice_date'
      });

      if (knjiznoZaduzenjeDocumentNumber && knjiznoZaduzenjeLinkedInvoice && knjiznoZaduzenjeLinkedInvoiceDate) {

        kzDocumentNumberField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.DISABLED
        });
        kzLinkedInvoiceField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.DISABLED
        });
        kzLinkedInvoiceDateField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.DISABLED
        });
        form.addPageInitMessage({type: message.Type.WARNING, title: 'Upozorenje!', message: 'Knjižno zaduženje je već napravljeno u sistemu! Ako ne želite da nastavite sa ovom akcijom, potrebno je uraditi Actions -> Delete umesto klika na "Cancel" dugme!'});

      } else {
        kzDocumentNumberField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        });
        kzLinkedInvoiceField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        });
        kzLinkedInvoiceDateField.updateDisplayType({
          displayType: serverWidget.FieldDisplayType.HIDDEN
        });
      }
    }
  }
  
  function afterSubmit(context) {
    if (context.type === context.UserEventType.CREATE) {
      var currRecordId = context.newRecord.id;
      
      var newRecord = record.load({
        type: record.Type.INVOICE,
        id: currRecordId,
        isDynamic: true
      });

      var knjiznoZaduzenjeDocumentNumber = newRecord.getValue({
        fieldId: 'custbody_rsm_kz_document_number'
      });
      var knjiznoZaduzenjeLinkedInvoice = newRecord.getValue({
        fieldId: 'custbody_rsm_kz_linked_invoice'
      });

      if (knjiznoZaduzenjeDocumentNumber && knjiznoZaduzenjeLinkedInvoice) {
        var newTranId = newRecord.getValue({
          fieldId: 'tranid'
        });

        newRecord.setValue({
          fieldId: 'tranid',
          value: 'KZ_' + newTranId
        });
        newRecord.setValue({
          fieldId: 'custbody_rsm_kz_document_number',
          value: 'KZ_' + newTranId
        });

        newRecord.save();
      }
    }
  }

  return {
    beforeLoad: beforeLoad,
    afterSubmit: afterSubmit
  };

});