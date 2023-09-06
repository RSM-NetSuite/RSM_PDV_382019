/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * 
 * 
 * 
 */
define(['N/record', 'N/query', 'N/log'], function (record, query, log) {

  function beforeSubmit(context) {
    if (context.type === context.UserEventType.CREATE ||
      context.type === context.UserEventType.EDIT) {

      var CURRENCIES = ['EUR', 'USD', 'CHF']; // foreign currencies in netsuite

      var currRecord = context.newRecord;

      var amount = currRecord.getValue('payment') || currRecord.getValue('applied');

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

      taxCodeRec = null;
      try {
        taxCodeRec = record.load({
          type: record.Type.SALES_TAX_ITEM,
          id: currRecord.getValue('custbody_poreski_kod_cust_dep_rsm')
        });
      } catch (err) {
        log.error('Error', "Couldn't load tax item record\n" + err);
        return;
      }

      var rate = taxCodeRec.getValue('custrecord_tax_rate_rsm'),
        isReverseCharge = taxCodeRec.getValue('custrecord_isreversecharge'),
        taxValue = null;

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

  return {
    beforeSubmit: beforeSubmit
  };

});