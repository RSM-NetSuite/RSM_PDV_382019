/**
 * popdvUtil.js
 * @NApiVersion 2.x
 * @NModuleScope Public
 *
 * Custom module with popdv util functions.
 * Exports getPopdvScheme, populatePopdvScheme functions
 *
 */

define(["N/search", "N/record", "N/file", "N/log"], function (search, record, file, log) {

  // Array of particular POPDV fields which should not contain negative value
  var nonNegativeFields = [
    '1.6',
    '1.7',
    '2.6',
    '2.7',
    '3.1',
    // '3.2', // This will be checked only for JE transactions in their own process function
    '3.3',
    '3.4',
    '3.5',
    '3.7',
    '3.9',
    '3a.1',
    '3a.2',
    '3a.3',
    '3a.4',
    '3a.6',
    '3a.7',
    '3a.8',
    '4.1.1',
    '4.1.4',
    '4.2.1',
    '5.2',
    '5.5',
    // '6.2.1', // This is checked in mapPopdvElements function
    // '6.2.2', // This is checked in mapPopdvElements function
    '6.4',
    '7.1',
    '7.2',
    '7.3',
    '7.4',
    '8a.1',
    '8a.2',
    '8a.3',
    '8a.4',
    '8a.7',
    '8b.1',
    '8b.2',
    '8b.3',
    '8b.4',
    '8b.7',
    '8v.3',
    '8g.1',
    '8g.2',
    '8g.3',
    '8g.6',
    '8e.3',
    '11.1',
    '11.2',
    '11.3'
  ];
  var negativeFields = [
    '3.6',
    '3a.5',
    '6.2.3',
    '8a.5',
    '8b.5',
    '8g.4',
    '8e.4'
  ];

  /**
   * Load popdv scheme json, parse it and return it
   * @returns {object} Object which represents popdv scheme
   */
  function getPopdvScheme() {
    var popdvSchemeFile = file.load({
      id: "./popdv_validation_scheme.json"
    });
    var popdvSchemeObj = JSON.parse(popdvSchemeFile.getContents())
    return popdvSchemeObj;
  }

  /**
   * Get tax codes with their field values as js objects
   * @param {string} dateStart
   * @param {string} dateEnd
   * @returns {search.ResultSet} NetSuite ResultSet object
   */
  function popdvTotalsSS(dateStart, dateEnd, subsidiaryId) {
    var dateFilter = (dateStart && dateEnd) ? ["custbody_popdv_datum", "within", dateStart, dateEnd] : ["custbody_popdv_datum", "within", "lastmonth"];

    var results = search.create({
      type: "transaction",
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters: [
        ["posting", "is", "T"],
        "AND",
        ["subsidiary", "anyof", subsidiaryId],
        "AND",
        ["taxline", "is", "F"],
        "AND",
        dateFilter,
        'AND',
        // ommit journal transactions totally
        ['type', 'noneof', ['Journal']],
        'AND',
        ["recordtype","isnot","vendorprepaymentapplication"],
        "AND", 
        ["recordtype","isnot","customerdeposit"],
        "AND", 
        ["recordtype","isnot","vendorprepayment"],
        "AND", 
        ["recordtype","isnot","depositapplication"],
        'AND',
        // ommit credit memos and journals with these settings in tax code (umanjenje pdv-a)
        [
          ['custbody_poreski_kod_cust_dep_rsm.custrecord_4110_import', 'is', 'F'],
          'OR',
          ['custbody_poreski_kod_cust_dep_rsm.custrecord_isexport', 'is', 'F']
        ]
      ],
      columns: [
        search.createColumn({
          name: "amount",
        }),
        search.createColumn({
          name: 'taxcode',
          join: 'taxDetail'
        }),
        search.createColumn({
          name: "taxamount",
          join: 'taxDetail'
        }),
        search.createColumn({
          name: "transactionnumber",
        }),
        search.createColumn({
          name: "type",
        }),
        search.createColumn({
          name: "custbody_popdv_datum",
        }),
        search.createColumn({
          name: "formulacurrency",
          formula: "CASE WHEN ({accounttype}='Other Current Liability' OR {accounttype}='Long Term Liability' OR {accounttype}='Deferred Revenue')AND {debitamount}>0 THEN {amount}*(-1)WHEN ({accounttype}='Bank' OR {accounttype}='Other Current Asset' OR {accounttype}='Fixed Asset' OR {accounttype}='Other Asset' OR {accounttype}='Deffered Expense')AND {creditamount}>0 THEN {amount}*(-1)ELSE {amount}END",
          label: "amount",
        })
      ]
    }).run();

    var ssResults = [],
    start = 0,
    end = 1000;

  // This fixes the Results.each() limit of 4000 results
  while (true) {
    // getRange returns an array of Result objects
    var tempList = results.getRange({
      start: start,
      end: end
    });
    if (tempList.length === 0) {
      break;
    }
    // Push tempList results into ssResults array
    Array.prototype.push.apply(ssResults, tempList);
    start += 1000;
    end += 1000;
  }
  log.emergency('11 saved search result popdvData',ssResults.length);

return ssResults;
  }

  /**
   * Creates and runs a transaction saved search - tran. types are: customerdeposit, vendorprepayment, depositapplication, vendorprepaymentapplication
   * @param {string} dateStart
   * @param {string} dateEnd
   * @returns {object} advance payment transactions as object
   */
  function getAdvancedPaymentTransactions(dateStart, dateEnd, subsidiaryId) {
    // GET 3.2 TAX CODES
    var dateFilter = (dateStart && dateEnd) ? ["custbody_popdv_datum", "within", dateStart, dateEnd] : ["custbody_popdv_datum", "within", "lastmonth"];

    var results = search.create({
      type: 'transaction',
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters: [
        dateFilter,
        'AND',
        [
          ['recordtype', 'is', 'customerdeposit'],
          'OR',
          ['recordtype', 'is', 'vendorprepayment'],
          'OR',
          ['recordtype', 'is', 'depositapplication'],
          'OR',
          ['recordtype', 'is', 'vendorprepaymentapplication']
        ],
        'AND',
        ["posting", "is", "T"],
        "AND",
        ["subsidiary", "anyof", subsidiaryId],
        "AND",
        ['mainline', 'is', 'T']
      ],
      columns: [
        'internalid',
        'custbody_popdv_datum',
        'recordtype',
        'tranid',
        'name',
        'amount',
        'transactionnumber',
        'type',
        'custbody_cust_dep_porez_iznos',
        'custbody_cust_dep_poreska_stopa',
        'custbody_poreski_kod_cust_dep_rsm',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_popdvpolje',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_odbitnipdv',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_rcpopdv',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_av_popdv_polje_prijava',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_av_odbitni_popdv_polje_prij',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_av_rc_popdv_polje_prijave',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_tax_rate_rsm',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_isreversecharge',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_4110_reduced_rate',
        'custbody_poreski_kod_cust_dep_rsm.custrecord_4110_non_deductible'
      ]
    }).run();

    var ssResults = [],
      start = 0,
      end = 1000;

    // This fixes the Results.each() limit of 4000 results
    while (true) {
      // getRange returns an array of Result objects
      var tempList = results.getRange({
        start: start,
        end: end
      });
      if (tempList.length === 0) {
        break;
      }
      // Push tempList results into ssResults array
      Array.prototype.push.apply(ssResults, tempList);
      start += 1000;
      end += 1000;
    }

    var obj = {};
    log.emergency('1 saved search result getAdvancedPaymentTransactions',ssResults.length);
    util.each(ssResults, function (result) {
  
      obj[result.getValue('internalid')] = {
        transactionId: result.getValue('tranid'),
        transactionNumber: result.getValue('transactionnumber'),
        popdvDate: result.getValue('custbody_popdv_datum'),
        type: result.getValue('type'),
        recordType: result.getValue('recordtype'),
        taxCode: result.getValue('custbody_poreski_kod_cust_dep_rsm') || null,
        taxCodeText: result.getText('custbody_poreski_kod_cust_dep_rsm') || null,
        amount: result.getValue('amount'),
        tax: result.getValue('custbody_cust_dep_porez_iznos') || null,
        rate: parseInt(result.getValue('custbody_cust_dep_poreska_stopa').replace(/%/g, '')) ||
          parseInt(result.getValue({ name: 'custrecord_tax_rate_rsm', join: 'custbody_poreski_kod_cust_dep_rsm' }).replace(/%/g, '')) || null,
        field: result.getValue({ name: 'custrecord_popdvpolje', join: 'custbody_poreski_kod_cust_dep_rsm' }) || null,
        deductionField: result.getValue({ name: 'custrecord_odbitnipdv', join: 'custbody_poreski_kod_cust_dep_rsm' }) || null,
        reverseChargeField: result.getValue({ name: 'custrecord_rcpopdv', join: 'custbody_poreski_kod_cust_dep_rsm' }) || null,
        avField: result.getValue({ name: 'custrecord_av_popdv_polje_prijava', join: 'custbody_poreski_kod_cust_dep_rsm' }) || null,
        avDeductionField: result.getValue({ name: 'custrecord_av_odbitni_popdv_polje_prij', join: 'custbody_poreski_kod_cust_dep_rsm' }) || null,
        avReverseChargeField: result.getValue({ name: 'custrecord_av_rc_popdv_polje_prijave', join: 'custbody_poreski_kod_cust_dep_rsm' }) || null,
        rc: result.getValue({ name: 'custrecord_isreversecharge', join: 'custbody_poreski_kod_cust_dep_rsm' }),
        reducedRate: result.getValue({ name: 'custrecord_4110_reduced_rate', join: 'custbody_poreski_kod_cust_dep_rsm' }),
        nonDeductable: result.getValue({ name: 'custrecord_4110_non_deductible', join: 'custbody_poreski_kod_cust_dep_rsm' })
      }
    });
    return obj;
  }

  /**
   * Creates and runs a transaction saved search - credit memos and journal entries with specific tax code
   * @param {string} dateStart
   * @param {string} dateEnd
   * @returns {Array} An array of objects with certain properties representing credit memo and journal entry transactions
   */
  function creditMemoJournalEntriesSS(dateStart, dateEnd, subsidiaryId) {
    var dateFilter = (dateStart && dateEnd) ? ["custbody_popdv_datum", "within", dateStart, dateEnd] : ["custbody_popdv_datum", "within", "lastmonth"];

    var results = search.create({
      type: "transaction",
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters: [
        // ["mainline", "is", "T"],
        // "AND",
        ["posting", "is", "T"],
        "AND",
        ["taxline", "is", "F"],
        "AND",
        ["subsidiary", "anyof", subsidiaryId],
        "AND",
        ['type', 'anyof', ['Journal', 'CustCred']],
        "AND",
        ['custbody_poreski_kod_cust_dep_rsm.custrecord_4110_import', 'is', 'T'],
        'AND',
        ['custbody_poreski_kod_cust_dep_rsm.custrecord_isexport', 'is', 'T'],
        "AND",
        dateFilter
      ],
      columns: [
        'internalid',
        search.createColumn({
          name: 'taxcode',
          join: 'taxDetail',
          label: 'Tax Code'
        }),
        'amount',
        search.createColumn({
          name: 'taxamount',
          join: 'taxDetail',
        }),
        'type',
        'recordtype',
        'transactionnumber',
        'custbody_popdv_datum'
      ]
    }).run();

    var ssResults = [],
      start = 0,
      end = 1000;

    // This fixes the Results.each() limit of 4000 results
    while (true) {
      // getRange returns an array of Result objects
      var tempList = results.getRange({
        start: start,
        end: end
      });
      if (tempList.length === 0) {
        break;
      }
      // Push tempList results into ssResults array
      Array.prototype.push.apply(ssResults, tempList);
      start += 1000;
      end += 1000;
    }

    var list = [];

    log.emergency('2 saved search result creditMemoJournalEntriesSS',ssResults.length);
    util.each(ssResults, function (result) {
  
      list.push({
        internalId: result.getValue('internalid'),
        taxCode: {
          text: result.getText(
            {
              name: 'taxcode',
              join: 'taxDetail',
            }
          ),
          value: result.getValue(
            {
            name: 'taxcode',
            join: 'taxDetail',
          }),
        },
        grossAmount: parseFloat(result.getValue('amount')),
        taxAmount: parseFloat(result.getValue({
          name: 'taxamount',
          join: 'taxDetail',
        })),
        type: result.getValue('type'),
        recordType: result.getValue('recordtype'),
        transactionNumber: result.getValue('transactionnumber'),
        popdvDate: result.getValue('custbody_popdv_datum')
      })
    });
    return list;
  }

  /**
   * Creates and runs a transaction saved search - journal entries only
   * @param {string} dateStart
   * @param {string} dateEnd
   * @returns {Array} An array of objects with certain properties representing credit memo and journal entry transactions
   */
  function journalEntriesSS(dateStart, dateEnd, subsidiaryId) {
    var dateFilter = (dateStart && dateEnd) ? ["custbody_popdv_datum", "within", dateStart, dateEnd] : ["custbody_popdv_datum", "within", "lastmonth"];

    var results = search.create({
      type: "transaction",
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters: [
        ["posting", "is", "T"],
        "AND",
        ["taxline", "is", "F"],
        "AND",
        ["subsidiary", "anyof", subsidiaryId],
        "AND",
        ['type', 'anyof', ['Journal']],
        "AND",
        // ommit journals with these settings in tax code (umanjenje pdv-a)
        [
          ['custbody_poreski_kod_cust_dep_rsm.custrecord_4110_import', 'is', 'F'],
          'OR',
          ['custbody_poreski_kod_cust_dep_rsm.custrecord_isexport', 'is', 'F']
        ],
        'AND',
        dateFilter
      ],
      columns: [
        'internalid',
        search.createColumn({
          name: 'taxcode',
          join: 'taxDetail',
          label: 'Tax Code'
        }),
        'amount',
        search.createColumn({
          name: 'taxamount',
          join: 'taxDetail',
        }),
        'type',
        'recordtype',
        'custbody_popdv_datum',
        'transactionnumber',
        search.createColumn({
          name: "formulacurrency",
          formula: "CASE WHEN ({accounttype}='Other Current Liability' OR {accounttype}='Long Term Liability' OR {accounttype}='Deferred Revenue')AND {debitamount}>0 THEN {amount}*(-1)WHEN ({accounttype}='Bank' OR {accounttype}='Other Current Asset' OR {accounttype}='Fixed Asset' OR {accounttype}='Other Asset' OR {accounttype}='Deffered Expense')AND {creditamount}>0 THEN {amount}*(-1)ELSE {amount}END",
          label: "Case Amount",
        })
      ]
    }).run();

    var ssResults = [],
      start = 0,
      end = 1000;

    // This fixes the Results.each() limit of 4000 results
    while (true) {
      // getRange returns an array of Result objects
      var tempList = results.getRange({
        start: start,
        end: end
      });
      if (tempList.length === 0) {
        break;
      }
      // Push tempList results into ssResults array
      Array.prototype.push.apply(ssResults, tempList);
      start += 1000;
      end += 1000;
    }

    var list = [];
    log.emergency('3 saved search result journalEntriesSS',ssResults.length);
    util.each(ssResults, function (result) {
      list.push({
        internalId: result.getValue('internalid'),
        taxCode:  {
          text: result.getText({
            name:'taxcode',
            join: 'taxDetail'
          }),
          value: result.getValue({
            name:'taxcode',
            join: 'taxDetail',
          })
        },
        grossAmount: parseFloat(result.getValue('formulacurrency')),
        taxAmount: parseFloat(result.getValue({
          name: 'taxamount',
          join: 'taxDetail',
        })),        
        type: result.getValue('type'),
        recordType: result.getValue('recordtype'),
        transactionNumber: result.getValue('transactionnumber'),
        popdvDate: result.getValue('custbody_popdv_datum')
      })
    });
    return list;
  }

  /**
   * Get tax codes with their field values as js objects
   * @returns {object} - Object with tax code sub-objects
   */
  function getTaxCodes() {
    var taxCodeResultSet = search.create({
      type: search.Type.SALES_TAX_ITEM,
      filters: [['country', 'anyof', 'RS']],
      columns: [
        'internalid',
        'name',
        'custrecord_tax_rate_rsm',
        'country',
        'custrecord_popdvpolje',
        'custrecord_odbitnipdv',
        'custrecord_rcpopdv',
        'custrecord_4110_reduced_rate',
        'custrecord_isreversecharge',
        'custrecord_4110_non_deductible',
        'taxtype'
      ]
    }).run();

    var obj = {};
    taxCodeResultSet.each(function (result) {
      obj[result.getValue('internalid')] = {
        internalId: result.getValue('internalid'),
        rate: result.getValue("custrecord_tax_rate_rsm"),
        popdvField: result.getValue("custrecord_popdvpolje").toLowerCase(),
        popdvDeductionField: result.getValue("custrecord_odbitnipdv").toLowerCase(),
        reverseChargeField: result.getValue("custrecord_rcpopdv").toLowerCase(),
        reducedRate: result.getValue("custrecord_4110_reduced_rate"),
        reverseCharge: result.getValue("custrecord_isreversecharge"),
        nonDeductable: result.getValue("custrecord_4110_non_deductible"),
        parent: result.getValue("taxtype") ? result.getValue("taxtype") : null
      };
      return true;
    });
    return obj;
  }

  /**
   * Maps POPDV elements into popdvScheme
   * @param {object} popdvScheme
   * @param {string} field custrecord_popdvpolje field value from tax code
   * @param {string} deductionField custrecord_odbitnipdv field value from tax code
   * @param {string} reverseChargeField custrecord_rcpopdv field value from tax code
   * @param {string} reducedRate custrecord_4110_reduced_rate1 checkbox field value ('T' or 'F')
   * @param {string} reverseCharge reversecharge checkbox field value ('T' or 'F')
   * @param {string} nonDeductable custrecord_4110_non_deductible checkbox field value ('T' or 'F')
   * @param {Number} rate tax code rate
   * @param {Number} parentRate tax code's parent rate
   * @param {Number} grossAmount
   * @param {Number} taxAmount
   * @param {boolean} isAdvancePayment boolean flag which tells if transaction is any of advance payment transaction types
   * @param {string}  recordType represents transaction record type in text format
   */
  function mapPopdvElements(
    popdvScheme,
    field,
    deductionField,
    reverseChargeField,
    reducedRate,
    reverseCharge,
    nonDeductable,
    rate,
    parentRate,
    grossAmount,
    taxAmount,
    isAdvancePayment,
    recordType,
    transaction,
    transactionTaxCode
  ) {
    var tranForValidation = {
      transactionNumber: transaction.transactionNumber,
      transactionType: transaction.type,
      grossAmount: Math.round(grossAmount),
      taxAmount: Math.round(taxAmount),
      popdvDate: transaction.popdvDate,
      taxCode: (transactionTaxCode) ? transactionTaxCode : ''
    }
    var popdvElement = "_POPDV";

    if (!field || field === '' || field === ' ') {
      return;
    }

    if(isNaN(taxAmount)){
      taxAmount=0
  }


  log.emergency('Check all taxes',taxAmount);

    if (field[1].match(/\./)) {
      popdvElement += field.substring(0, 1);
    } else if (field[0] === "8") {
      popdvElement += "8";
    } else {
      popdvElement += field.substring(0, 2); // tables 3a, 9a, 10, 11
    }

    // Check for certain fields - if they have negative value set it to 0
    if (!isAdvancePayment && nonNegativeFields.indexOf(field) > -1) {
      tranForValidation.grossAmount = (grossAmount < 0) ? 0 : grossAmount;
      tranForValidation.taxAmount = (taxAmount < 0) ? 0 : taxAmount;
    }

    // Check for certain fields - if they have positive value set it to 0
    if (!isAdvancePayment && negativeFields.indexOf(field) > -1) {
      tranForValidation.grossAmount = (grossAmount > 0) ? 0 : grossAmount;
      tranForValidation.taxAmount = (taxAmount > 0) ? 0 : taxAmount;
    }

    // This part represents edge cases for fields in popdv document
    if (field.match(/^1\./)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    } else if (field.match(/^2\./)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    } else if (field.match(/^3\./)) {
      if (
        field.match(/^3\.1/) ||
        field.match(/^3\.2/) ||
        field.match(/^3\.7/)
      ) {
        if (reducedRate) {
          popdvScheme[popdvElement]['_' +field]['_' +field + ".3"].push(tranForValidation); // Math.abs(grossAmount);
          popdvScheme[popdvElement]['_' +field]['_' +field + ".4"].push(tranForValidation);  // Math.abs(taxAmount);
        } else {
          popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation); // Math.abs(grossAmount);
          popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation); // Math.abs(taxAmount);
        }
      } else if (field.match(/^3\.3/) || field.match(/^3\.4/)) {
        if (reducedRate) {
          tranForValidation.grossAmount = Math.abs(grossAmount);
          popdvScheme[popdvElement]['_' +field]['_' +field + ".3"].push(tranForValidation);
        } else {
          tranForValidation.grossAmount = Math.abs(grossAmount);
          popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation);
        }
      } else {
        if (reducedRate) {
          popdvScheme[popdvElement]['_' +field]['_' +field + ".3"].push(tranForValidation);
          popdvScheme[popdvElement]['_' +field]['_' +field + ".4"].push(tranForValidation);
        } else {
          popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation);
          popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation);
        }
      }
    } else if (field.match(/^4\.1/)) {
      popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation);
      popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation);
    } else if (field.match(/^4\.2/)) {
      if (reducedRate) {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation);
      } else {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation);
      }
    } else if (field.match(/^6\./)) {
      if (field.match(/^6\.1/)) {
        popdvScheme[popdvElement]['_' +field].push(tranForValidation);
      } else {
        var value;
        if (field.match(/^6\.2\.1/) || field.match(/^6\.2\.2/)) {
          rate = (typeof rate === 'string') ? parseInt(rate.replace(/%/g, '')) : rate;
          value = (grossAmount) ? grossAmount : Math.abs(taxAmount / (rate / 100));
          tranForValidation.grossAmount = value;
        }
        if (field.match(/^6\.2\.3/)) {
          value = (taxAmount / (rate / 100)) * -1; // Show it as negative value
          tranForValidation.grossAmount = value;
        }
        if (reducedRate) {
          popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation);
        } else {
          popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation);
        }
      }
      popdvScheme[popdvElement]["_6.3"] = popdvScheme[popdvElement]["_6.3"].concat(popdvScheme[popdvElement]["_6.1"]);
      popdvScheme[popdvElement]["_6.3"] = popdvScheme[popdvElement]["_6.3"].concat(popdvScheme[popdvElement]["_6.2.1"]["_6.2.1.1"]);
      popdvScheme[popdvElement]["_6.3"] = popdvScheme[popdvElement]["_6.3"].concat(popdvScheme[popdvElement]["_6.2.1"]["_6.2.1.2"]);
      popdvScheme[popdvElement]["_6.3"] = popdvScheme[popdvElement]["_6.3"].concat(popdvScheme[popdvElement]["_6.2.2"]["_6.2.2.1"]);
      popdvScheme[popdvElement]["_6.3"] = popdvScheme[popdvElement]["_6.3"].concat(popdvScheme[popdvElement]["_6.2.2"]["_6.2.2.2"]);
      popdvScheme[popdvElement]["_6.3"] = popdvScheme[popdvElement]["_6.3"].concat(popdvScheme[popdvElement]["_6.2.3"]["_6.2.3.1"]);
      popdvScheme[popdvElement]["_6.3"] = popdvScheme[popdvElement]["_6.3"].concat(popdvScheme[popdvElement]["_6.2.3"]["_6.2.3.2"]);


    } else if (field.match(/^7\.1/) || field.match(/^7\.2/)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    } else if (field.match(/^7\.3/)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    } else if (field.match(/^8a/)) {
      if (reducedRate) {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".3"].push(tranForValidation);
        popdvScheme[popdvElement]['_' +field]['_' +field + ".4"].push(tranForValidation);
      } else {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation);
        popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation);
      }
    } else if (field.match(/^8b/)) {
      // if any of application transactions, reduce net amount by tax amount
      if (reducedRate) {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation); //(isAdvancePayment && anyOfApplication(recordType)) ? taxAmount : grossAmount;
      } else {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation); //(isAdvancePayment && anyOfApplication(recordType)) ? taxAmount : grossAmount;
      }
    } else if (field.match(/^8v/)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    } else if (field.match(/^8g/)) {
      if (reducedRate) {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".2"].push(tranForValidation);
      } else {
        popdvScheme[popdvElement]['_' +field]['_' +field + ".1"].push(tranForValidation);
      }
    } else if (field.match(/^8d/)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    } else if (field.match(/^9a/)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    } else if (field.match(/^11/)) {
      popdvScheme[popdvElement]['_' +field].push(tranForValidation);
    }

    // Deduction field group
    if (deductionField) {
      if (deductionField.match(/^6.4/)) {
        popdvScheme["_POPDV6"]['_' +deductionField].push(tranForValidation);
      } else if (deductionField.match(/^8e/)) {
        if (
          deductionField.match(/^8e\.1/) ||
          deductionField.match(/^8e\.2/)
        ) {
          if (reverseCharge) {
            var notionalTaxAmount = grossAmount * (parentRate / 100);
            // if any of application transaction, notional tax amount is already calculated and is negative (taxAmount)
            notionalTaxAmount = (anyOfApplication(recordType)) ? taxAmount : notionalTaxAmount;
            tranForValidation.taxAmount = (notionalTaxAmount) ? notionalTaxAmount : 0;
            popdvScheme['_POPDV8']['_' +deductionField].push(tranForValidation);
          } else {
            popdvScheme['_POPDV8']['_' +deductionField].push(tranForValidation);
          }
        } else {
          popdvScheme["_POPDV8"]['_' +deductionField].push(tranForValidation);
        }
      }
    }

    // Reverse charge field group
    if (reverseCharge && reverseChargeField.match(/^3a/)) {
      // Notional tax amount calculation
      var notionalTaxAmount = grossAmount * (parentRate / 100);
      // if any of application transaction, notional tax amount is already calculated and is negative (taxAmount)
      notionalTaxAmount = (anyOfApplication(recordType)) ? taxAmount : notionalTaxAmount;
      tranForValidation.taxAmount = notionalTaxAmount;
      if (
        reverseChargeField.match(/^3a\.1/) ||
        reverseChargeField.match(/^3a\.2/) ||
        reverseChargeField.match(/^3a\.3/) ||
        reverseChargeField.match(/^3a\.6/)
      ) {
        notionalTaxAmount = (anyOfApplication(recordType)) ? notionalTaxAmount : Math.abs(notionalTaxAmount);
        tranForValidation.taxAmount = notionalTaxAmount;
      }
      if (reducedRate) {
        popdvScheme["_POPDV3a"]['_' +reverseChargeField]['_' +reverseChargeField + ".2"].push(tranForValidation);
      } else {
        popdvScheme["_POPDV3a"]['_' +reverseChargeField]['_' +reverseChargeField + ".1"].push(tranForValidation);
      }
    }
  }

  /**
   * Check if record type (transaction) is any of depositapplication or vendorprepaymentapplication
   * @param {string} recordType represents transaction record type in text format
   * @returns {boolean}
   */
  function anyOfApplication(recordType) {
    return recordType === 'depositapplication' || recordType === 'vendorprepaymentapplication';
  }

  /**
   * Goes through each transaction and modifies popdvScheme with net and tax amounts depending on transaction type
   * Advance payment transactions - customer deposit, deposit application, vendor prepayment, vendor prepayment application
   * @param {object} popdvScheme
   * @param {object} transactions advance payment transactions object
   * @param {object} taxCodeObj
   */
  function processAdvancedPayments(popdvScheme, transactions, taxCodeObj) {
    log.audit('Count transactions processAdvancedPayments',transactions.length)
    util.each(transactions, function (tran, id) {
      // Get parent rate if tax code is reverse charge
      var parentRate =
        tran.rc && taxCodeObj[tran.taxCode]["taxtype"]
          ? record
            .load({
              id: taxCodeObj[tran.taxCode]["taxtype"],
              type: search.Type.SALES_TAX_ITEM
            })
            .getValue("custrecord_tax_rate_rsm")
          : null;
      switch (tran.recordType) {
        case 'customerdeposit':
        case 'vendorprepayment':
          if (tran.avField) {
            mapPopdvElements(
              popdvScheme,
              (tran.avField) ? tran.avField.toLowerCase() : null,
              (tran.avDeductionField) ? tran.avDeductionField.toLowerCase() : null,
              (tran.avReverseChargeField) ? tran.avReverseChargeField.toLowerCase() : null,
              tran.reducedRate,
              tran.rc,
              tran.nonDeductable,
              tran.rate,
              parentRate,
              (tran.rc && tran.recordType === 'vendorprepayment') ? Math.abs(tran.amount) : Math.abs(tran.amount) - Math.abs(tran.tax),
              Math.abs(tran.tax),
              true, // is advance payment
              tran.recordType,
              tran,
              tran.taxCodeText
            );
          }
          break;
        case 'depositapplication':
        case 'vendorprepaymentapplication':
          if (tran.field) {
            // Calculate tax amount using different formulas depending on reverse charge value
            var tax = (tran.rc) ?
              -1 * Math.abs(tran.amount) * (tran.rate / 100) :
              -1 * (Math.abs(tran.amount) / (1 + tran.rate / 100) * (tran.rate / 100));
            mapPopdvElements(
              popdvScheme,
              (tran.field) ? tran.field.toLowerCase() : null,
              (tran.deductionField) ? tran.deductionField.toLowerCase() : null, // deduction field
              (tran.reverseChargeField) ? tran.reverseChargeField.toLowerCase() : null, // reverse charge field
              tran.reducedRate,
              tran.rc, // reverse charge
              tran.nonDeductable, // non deductable
              tran.rate, // rate
              parentRate,
              (tran.field.toLowerCase() === '11.1') ? parseFloat(tran.amount) : 0, // amount
              tax,
              true, // is advance payment
              tran.recordType,
              tran,
              tran.taxCodeText
            );
          }
          break;
        default:
          break;
      }
    });
  }

  /**
   * Iterates through credit memo and journal transactions with a certain tax code and
   * populates popdvScheme with provided parameters
   * @param {object} popdvScheme
   * @param {Array} transactions Array of credit memo and journal transactions as JS objects
   * @param {object} taxCodeObj
   */
  function processCreditMemos(popdvScheme, transactions, taxCodeObj) {
    log.audit('Count transactions processCreditMemos',transactions.length)

    util.each(transactions, function (tran) {
      var taxCode = taxCodeObj[tran.taxCode.value];
      var amount, taxAmount;
      if (tran.recordType === 'creditmemo') {
        amount = tran.grossAmount; taxAmount = 0;
      } else {
        amount = 0; taxAmount = tran.taxAmount;
        if (taxCode.popdvField.match(/3.2/g)) { // in other words.. if tax code is ragraniceni
          amount = Math.abs(tran.grossAmount);
          taxAmount = Math.abs(tran.taxAmount);
        }
      }
      mapPopdvElements(
        popdvScheme,
        taxCode.popdvField,
        taxCode.deductionField,
        taxCode.reverseChargeField,
        taxCode.reducedRate,
        taxCode.reverseCharge,
        taxCode.nonDeductable,
        taxCode.rate,
        taxCode.rate,
        amount,
        taxAmount,
        false,
        tran.recordType,
        tran,
        tran.taxCode.text
      );
    });
  }

  /**
   Iterates through journal transactions and populates popdvScheme with provided parameters
   * @param {object} popdvScheme
   * @param {Array} transactions Array of journal transactions as JS objects
   * @param {object} taxCodeObj
   */
  function processJournals(popdvScheme, transactions, taxCodeObj) {
       log.audit('Count transactions processJournals',transactions.length)
    util.each(transactions, function (tran) {

      if(tran.taxCode.value!==null && tran.taxCode.value !== ''){

      var taxCode = taxCodeObj[tran.taxCode.value];
      var reverseCharge = taxCode.reverseCharge;
      var amount = tran.grossAmount,
        taxAmount = tran.taxAmount;

      if (amount < 0) {
        taxAmount = (taxAmount > 0) ? -taxAmount : taxAmount;
      } else {
        taxAmount = (taxAmount < 0) ? -taxAmount : taxAmount;
      }

      if (taxCode.popdvField.match(/3.2/g)) {
        amount = Math.abs(tran.grossAmount);
        taxAmount = Math.abs(tran.taxAmount);
      }

      // Get parent rate if tax code is reverse charge
      var parentRate =
        reverseCharge && taxCode["taxtype"]
          ? record
            .load({
              id: taxCode["taxtype"],
              type: search.Type.SALES_TAX_ITEM
            })
            .getValue("custrecord_tax_rate_rsm")
          : null;
      mapPopdvElements(
        popdvScheme,
        taxCode.popdvField,
        taxCode.popdvDeductionField,
        taxCode.reverseChargeField,
        taxCode.reducedRate,
        taxCode.reverseCharge,
        taxCode.nonDeductable,
        taxCode.rate,
        parentRate,
        amount,
        taxAmount,
        false,
        tran.recordType,
        tran,
        tran.taxCode.text
      );
      }
    });
  }

  /**
   * Populates popdv scheme with popdv data for each tax code
   * @param {object} popdvScheme
   * @param {string} dateStart
   * @param {string} dateEnd
   */
  function populatePopdvScheme(popdvScheme, dateStart, dateEnd, subsidiaryId) {
    var popdvData = popdvTotalsSS(dateStart, dateEnd, subsidiaryId);
    var advancedPaymentTransactions = getAdvancedPaymentTransactions(dateStart, dateEnd, subsidiaryId);
    var creditMemoJournalTransactions = creditMemoJournalEntriesSS(dateStart, dateEnd, subsidiaryId);
    var journalTransactions = journalEntriesSS(dateStart, dateEnd, subsidiaryId);
    var taxCodeObj = getTaxCodes();

    util.each(popdvData, function (result) {

      var taxCode = result.getValue({
        name: 'taxcode',
        join: 'taxDetail'
      });
      
      var taxCodeText = result.getText({
        name: 'taxcode',
        join: 'taxDetail'
            });

      if(taxCode==""){
        // result.getValue('')
        // Loaded $RESULT but not found taxCode
        return false;
       }
      // var grossAmount = parseFloat(result.getValue({ name: "grossamount", summary: search.Summary.SUM }));
      
      // Proveri da li treba da se Join tabela 
      var grossAmount = parseFloat(result.getValue({ name:"formulacurrency"}));
      var taxAmount = parseFloat(result.getValue({ name: "taxamount",join: 'taxDetail'}));
      var transactionNumber = result.getValue({name: "transactionNumber"});
      var transactionType = result.getValue({name: 'type'});
      var popdvDate = result.getValue({name: "custbody_popdv_datum"});
      // var recordType = result.getValue({ name: 'recordtype', summary: search.Summary.GROUP });

      log.error('Check tax amount',taxAmount);
      // Set tax amount to the same sign as base amount
      // if base is negative, tax needs to be negative also and the other way around
      if (grossAmount < 0) {
        taxAmount = (taxAmount > 0) ? -taxAmount : taxAmount;
      } else {
        taxAmount = (taxAmount < 0) ? -taxAmount : taxAmount;
      }
      var transaction = {
        grossAmount: grossAmount,
        taxAmount: taxAmount,
        transactionNumber: transactionNumber,
        type: transactionType,
        popdvDate: popdvDate
      }

      log.debug('Check taxCodeObj',taxCodeObj);
      log.debug('Check taxCode',taxCode);


      // Fields from tax code object
      var field = taxCodeObj[taxCode]["popdvField"].toLowerCase() || "nema";
      var deductionField = taxCodeObj[taxCode]["popdvDeductionField"].toLowerCase();
      var reverseChargeField = taxCodeObj[taxCode]["reverseChargeField"].toLowerCase();
      var rate = taxCodeObj[taxCode]["rate"];
      rate = parseInt(rate.replace(/%/g, ''));
      var reducedRate = taxCodeObj[taxCode]["reducedRate"];
      var reverseCharge = taxCodeObj[taxCode]["reverseCharge"];
      var nonDeductable = taxCodeObj[taxCode]["nonDeductable"];

      // Get parent rate if tax code is reverse charge
      var parentRate =
        reverseCharge && taxCodeObj[taxCode]["taxtype"]
          ? record
            .load({
              id: taxCodeObj[taxCode]["taxtype"],
              type: search.Type.SALES_TAX_ITEM
            })
            .getValue("custrecord_tax_rate_rsm")
          : null;

      mapPopdvElements(
        popdvScheme,
        field,
        deductionField,
        reverseChargeField,
        reducedRate,
        reverseCharge,
        nonDeductable,
        rate,
        parentRate,
        grossAmount,
        taxAmount,
        false, // is advance payment
        null, // recordType
        transaction,
        taxCodeText
      );

      return true;
    });

    // Process advanced payment transactions
    processAdvancedPayments(popdvScheme, advancedPaymentTransactions, taxCodeObj);
    // Process credit memos and journals created from these credit memos (specific tax code)
    processCreditMemos(popdvScheme, creditMemoJournalTransactions, taxCodeObj);
    // Process journals only
    processJournals(popdvScheme, journalTransactions, taxCodeObj);

    // These fields cannot have negative values at the end of popdvScheme mapping
    // Needed to do this here because of deposit application transactions
    //popdvScheme["POPDV3"]["3.1"]["3.1.2"] = (popdvScheme["POPDV3"]["3.1"]["3.1.2"] < 0) ? 0 : popdvScheme["POPDV3"]["3.1"]["3.1.2"];
    //popdvScheme["POPDV3"]["3.1"]["3.1.4"] = (popdvScheme["POPDV3"]["3.1"]["3.1.4"] < 0) ? 0 : popdvScheme["POPDV3"]["3.1"]["3.1.4"];
    //popdvScheme["POPDV3"]["3.2"]["3.2.2"] = (popdvScheme["POPDV3"]["3.2"]["3.2.2"] < 0) ? 0 : popdvScheme["POPDV3"]["3.2"]["3.2.2"];
    //popdvScheme["POPDV3"]["3.2"]["3.2.4"] = (popdvScheme["POPDV3"]["3.2"]["3.2.4"] < 0) ? 0 : popdvScheme["POPDV3"]["3.2"]["3.2.4"];
    //popdvScheme["POPDV3"]["3.7"]["3.7.2"] = (popdvScheme["POPDV3"]["3.7"]["3.7.2"] < 0) ? 0 : popdvScheme["POPDV3"]["3.7"]["3.7.2"];
    //popdvScheme["POPDV3"]["3.7"]["3.7.4"] = (popdvScheme["POPDV3"]["3.7"]["3.7.4"] < 0) ? 0 : popdvScheme["POPDV3"]["3.7"]["3.7.4"];

    //roundValues(popdvScheme);
    //calculateSumValues(popdvScheme);
  }

  return {
    getPopdvScheme: getPopdvScheme,
    populatePopdvScheme: populatePopdvScheme
  }

});