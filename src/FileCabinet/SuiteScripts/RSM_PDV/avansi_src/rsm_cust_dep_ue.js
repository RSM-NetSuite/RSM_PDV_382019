/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * 
 * User event script for customer deposit which calculates tax amount and rate using tax code associated with the
 * transaction record.
 * Creates buttons on form for calling appropriate functions from client script linked on the form.
 * 
 */
define(['N/record', 'N/query', 'N/log', 'N/runtime'], function (record, query, log, runtime) {

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
        fieldId: 'custrecord_rsm_config_cust_dep_pdf'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cust_dep_pdf_ino'
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
        fieldId: 'custrecord_rsm_config_cust_dep_pdf'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cust_dep_pdf_ino'
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
        fieldId: 'custrecord_rsm_config_cust_dep_email'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cust_dep_email_ino'
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
        fieldId: 'custrecord_rsm_config_cust_dep_email'
      });
      var transactionTemplateIno = configRecord.getValue({
        fieldId: 'custrecord_rsm_config_cust_dep_email_ino'
      });

      if (transactionTemplateSrb === '' && transactionTemplateIno === '') {
        emailFlag = false;
      }
      return emailFlag;
    }
  }

  function beforeSubmit(context) {
    if (context.type === context.UserEventType.CREATE ||
      context.type === context.UserEventType.EDIT) {

      var CURRENCIES = ['EUR', 'USD', 'CHF']; // foreign currencies in netsuite

      var currRecord = context.newRecord;

      var amount = currRecord.getValue('payment');

      // Get currency name with the profided id (RSD)
      var currencyId = currRecord.getValue('currency');
      var currencyResultSet = query.runSuiteQL({
        query: "SELECT symbol FROM currency WHERE id = ?",
        params: [currencyId]
      });
      var currency = currencyResultSet.results[0].values[0];
      
      // Check the currency and convert amount to RSD if currency is any of CURRENCIES
      if (currency !== 'RSD') {
        var exchangeRate = parseFloat(currRecord.getValue('exchangerate'));
        amount = exchangeRate * amount;
      }

      var taxCodeRec = null;
      try {
        taxCodeRec = record.load({
          type: record.Type.SALES_TAX_ITEM,
          id: currRecord.getValue('custbody_poreski_kod_cust_dep_rsm')
        });
      } catch (err) {
        log.error('Error', "Couldn't load tax item record\n" + err);
        return;
      }

      log.error('Check tax code data',JSON.stringify(taxCodeRec));
      log.error('Check tax code keys',Object.keys(taxCodeRec));



      var rate = taxCodeRec.getValue('custrecord_tax_rate_rsm'),
        isReverseCharge = taxCodeRec.getValue('custrecord_isreversecharge'),
        taxValue;

      // If reverse charge
      if (isReverseCharge) {
        try {
          rate = record.load({
            id: taxCodeRec.getValue('parent'),
            type: record.Type.SALES_TAX_ITEM
          }).getValue("custrecord_tax_rate_rsm");

          // Calculate tax value with parent rate
          taxValue = amount * (rate / 100);
        } catch (err) {
          log.error('Error', "Couldn't load tax item 'parent' record\n" + err);
          return;
        }
      } else {
        // Calculate tax value with standard rate
        taxValue = amount / (1 + rate / 100) * (rate / 100);
      }

      currRecord.setValue({
        fieldId: 'custbody_cust_dep_poreska_stopa',
        value: rate
      });

      currRecord.setValue({
        fieldId: 'custbody_cust_dep_porez_iznos',
        value: parseFloat(taxValue.toFixed(2))
      });

    }
  }

  function beforeLoad(context) {
    if (context.type === context.UserEventType.VIEW) {

      var form = context.form;
      form.clientScriptModulePath = './rsm_cust_dep_invoice_cs.js';
      var custDepRec = context.newRecord;

      var pdfFlag = getPdfFlag(custDepRec);
      var emailFlag = getEmailFlag(custDepRec);

      if (pdfFlag) {
        form.addButton({
          id: 'custpage_cust_dep_create_pdf',
          label: "Kreiraj PDF dokument",
          functionName: 'createCustomerDepositPdf'
        });
      }
      if (emailFlag) {
        form.addButton({
          id: 'custpage_cust_dep_email',
          label: "Posalji PDF dokument",
          functionName: 'emailCustomerDepositPdf'
        });
      }
    }
  }

  return {
    beforeLoad: beforeLoad,
    beforeSubmit: beforeSubmit,
  };

});