/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/file', 'N/runtime', 'N/util', 'N/log'], function (record, search, file, runtime, util, log) {

  var counter = 0;

  function getEntityForJournal(customerId, entities) {
    for (var entityId in entities) {
      if (entities[entityId].type === 'CustJob' && entities[entityId].entityid === customerId) {
        return entities[entityId].internalid;
      }
    }
  }

  function formatCurrency(value) {
    if (!value && value === '' && value === ' ') {
      return value;
    }
    var sign = '', decimalPart = '';
    try {
      sign = value.match(/\-/g)[0];
      value = value.replace(sign, '');
    } catch (error) {
    }
    try {
      decimalPart = value.match(/\..+/g)[0];
      value = value.replace(decimalPart, '');
    } catch (error) {
    }

    var newValue = '';
    for (var i = value.length - 1, j = 0; i >= 0; i--, j++) {
      if (j % 3 == 0) {
        newValue = newValue !== '' ? ',' + newValue : newValue;
        newValue = value[i] + newValue;
      } else {
        newValue = value[i] + newValue;
      }
    }
    return sign + newValue + decimalPart;
  }

  function getTransactionTypeTranslation(type) {
    var returnValue = '';
    switch(type) {
      case "Invoice":
        returnValue = 'Invoice - Izlazna faktura';
        break;
      case "Customer Deposit":
        returnValue = 'Customer Deposit - Primljeni avansi';
        break;
      case "Deposit Application":
        returnValue = 'Deposit Application - Primljeni avansi sadržani u konačnoj izlaznoj fakturi';
        break;
      case "Credit Memo":
        returnValue = 'Credit Memo - Dokument za umanjenje osnovice/izlazne fakture';
        break;
      case "Journal":
        returnValue = 'Journal - Nalog za knjiženje';
        break;
      case "Bill":
        returnValue = 'Bill - Ulazna faktura';
        break;
      case "Bill Credit":
        returnValue = 'Bill Credit - Dokument za umanjenje osnovice/ulazne fakture';
        break;
      default:
        returnValue = 'Cash Sale - Gotovinske uplate';
        break;
    }
    return returnValue;
  }
  /**
   * Generates readable datetime stamp at the moment of calling
   * @returns {string} Readable datetime format
   */
  function createdAt() {
    var d = new Date();

    var date = d.getDate(),
      month = d.getMonth() + 1,
      year = d.getFullYear(),
      hours = d.getHours(),
      minutes = d.getMinutes(),
      seconds = d.getSeconds();

    date = (date < 10) ? '0' + date : date;
    month = (month < 10) ? '0' + month : month;

    hours = (hours < 10) ? '0' + hours : hours;
    minutes = (minutes < 10) ? '0' + minutes : minutes;
    seconds = (seconds < 10) ? '0' + seconds : seconds;

    return date + '-' + month + '-' + year + ' ' + hours + ':' + minutes + ':' + seconds;
  }

  /**
   * Creates and runs transaction saved search
   * @returns {search.Search} Netsuite search.Search object encapsulation
   */
  function createKIFSearch(from, to, subsidiaryId) {
    var srch = search.create({
      type: "transaction",
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters:
        [
          ["subsidiary","anyof",subsidiaryId],
          "AND",
          // ["taxitem.country","anyof","RS"],
          // "AND",
          // ["taxitem.availableon","anyof","SALE"],
          // "AND",
          ["type","anyof","CustInvc","CustCred"],
          "AND",
          ["custbody_popdv_datum","within", from, to],
          "AND",
          ["taxline","is","F"],
          "AND",
          ["posting","is", "T"]
        ],
      columns: [
          search.createColumn({ name: 'internalid', label: 'Internal ID' }),
          search.createColumn({
            name: 'transactionnumber',
            label: 'Transaction Number'
          }),
          search.createColumn({ name: 'tranid', label: 'Document Number' }),
          search.createColumn({ name: 'amount', label: 'Amount (Gross)' }),
          search.createColumn({ name: 'debitamount', label: 'Amount (Debit)' }),
          search.createColumn({ name: 'type', label: 'Type' }),
          search.createColumn({ name: 'recordType', label: 'recordType' }),
          search.createColumn({ name: 'custentity_pib', join: 'vendor' }),
          search.createColumn({ name: "amount", label: "Amount" }),
          search.createColumn({ name: "memo", label: "Memo" }),
          search.createColumn({ name: "trandate", label: "Date" }),
          search.createColumn({name: "mainname", label: "Main Line Name"}),
          search.createColumn({
            name: 'taxamount',
            join: 'taxDetail',
            label: 'Tax Amount'
          }),
          search.createColumn({
            name: 'taxrate',
            join: 'taxDetail',
            label: 'Tax Rate'
          }),
          search.createColumn({
            name: 'taxcode',
            join: 'taxDetail',
            label: 'Tax Code'
          }),
          search.createColumn({
            name: 'taxtype',
            join: 'taxDetail',
            label: 'Tax Type'
          }),
          search.createColumn({
            name: 'tranestgrossprofit',
            label: 'Amount (tranestgrossprofit)'
          }),
          search.createColumn({
            name: "description",
            join: "taxCode",
            label: "Description"
         }),
          search.createColumn({ name: 'taxtotal', label: 'Amount (taxtotal)' }),
          search.createColumn({ name: 'taxamount', label: 'Amount (taxamount)' }),
          search.createColumn({ name: 'netamount', label: 'Amount (netamount)' }),
          search.createColumn({ name: 'amount', label: 'Amount (amount)' }),
          search.createColumn({ name: "account", label: "Account" }),
          search.createColumn({ name: "custbody_rsm_bill_datum_prometa", label: "Datum izdavanja"}),
          search.createColumn({ name: "custbody_datumprometa", label: "Datum izdavanja fakture"}),
          search.createColumn({
            name: 'custbody_popdv_datum',
            label: 'POPDV Datum'
          }),
          search.createColumn({
            name: 'formulacurrency',
            formula: '{taxdetail.taxamount}+{amount}',
            label: 'Ukupno sa PDV'
          }),
          search.createColumn({
            name: "formulacurrency",
            formula: "CASE WHEN ({accounttype}='Other Current Liability' OR {accounttype}='Long Term Liability' OR {accounttype}='Deffered Revenue')AND {debitamount}>0 THEN {amount}*(-1)WHEN ({accounttype}='Bank' OR {accounttype}='Other Current Asset' OR {accounttype}='Fixed Asset' OR {accounttype}='Other Asset' OR {accounttype}='Deffered Expense')AND {creditamount}>0 THEN {amount}*(-1)ELSE {amount}END",
            label: "New Amount"
          })
        ]
    });
    return srch;
  }

  /**
   * Creates and returns transaction saved search
   * @returns {search.Search} Netsuite search.Search object encapsulation
   */
  function createDEPSearch(from, to, subsidiaryId) {
    return search.create({
      type: "transaction",
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters:
        [
          ["custbody_popdv_datum", "within", from, to],
          "AND",
          ["type", "anyof", "CustDep", "DepAppl"],
          "AND",
          // ["accounttype","anyof","DeferRevenue","Income","OthIncome"], 
          // "AND", 
          ["mainline", "is", "T"],
          "AND",
          ["subsidiary", "anyof", subsidiaryId],
          "AND",
          ["posting","is", "T"]
        ],
      columns:
        [
          search.createColumn({
            name: "ordertype",
            sort: search.Sort.ASC,
            label: "Order Type"
          }),
          search.createColumn({ name: "trandate", label: "Date" }),
          search.createColumn({ name: "type", label: "Type" }),
          search.createColumn({ name: "tranid", label: "Document Number" }),
          search.createColumn({ name: "entity", label: "Name" }),
          search.createColumn({ name: 'entityid', join: 'customer' }),
          search.createColumn({ name: 'companyname', join: 'customer' }),
          search.createColumn({ name: 'custentity_pib', join: 'customer' }),
          search.createColumn({ name: "account", label: "Account" }),
          search.createColumn({ name: "memo", label: "Memo" }),
          search.createColumn({ name: "amount", label: "Amount" }),
          search.createColumn({ name: "custbody_poreski_kod_cust_dep_rsm", label: "Poreski kod (Tax code)" }),
          search.createColumn({ name: "custbody_cust_dep_porez_iznos", label: "Porez" }),
          search.createColumn({ name: "custbody_popdv_datum", label: "POPDV Datum" }),
          search.createColumn({ name: "description", join: "custbody_poreski_kod_cust_dep_rsm", label: "Description" }),
          search.createColumn({
            name: "custrecord_tax_rate_rsm",
            join: "CUSTBODY_PORESKI_KOD_CUST_DEP_RSM",
            label: "Rate"
          }),
          search.createColumn({
            name: 'custrecord_isreversecharge',
            join: 'CUSTBODY_PORESKI_KOD_CUST_DEP_RSM'
          }),
          search.createColumn({ name: "internalid", label: "Internal ID" }),
          search.createColumn({ name: 'appliedtotransaction' })
        ]
    });
  }

  /**
   * Create and run entity saved search then create an object out of column values
   * @returns {object} object with entity internal id's as keys and name and pib as properties
   */
  function getEntities(subsidiaryId) {
    var searchResults = search.create({
      type: 'entity',
      filters: [
        ["subsidiary","anyof",subsidiaryId]
      ],
      columns: [
        'internalid',
        'type',
        'address',
        'address1',
        'country',
        'city',
        'zipcode',
        'entityid',
        // 'altname',
        'custentity_pib'
      ]
    }).run();

    var obj = {};
    var results = [],
      start = 0,
      end = 1000;

    // This fixes the Results.each() limit of 4000 results
    while (true) {
      // getRange returns an array of Result objects
      var tempList = searchResults.getRange({
        start: start,
        end: end
      });

      if (tempList.length === 0) {
        break;
      }

      // Push tempList results into newResults array
      Array.prototype.push.apply(results, tempList);
      start += 1000;
      end += 1000;
    }

    util.each(results, function (result) {
      obj[result.getValue('internalid')] = {
        internalid: result.getValue('internalid'),
        type: result.getValue('type'),
        address: result.getValue('address'),
        address1: result.getValue('address1'),
        country: result.getValue('country'),
        city: result.getValue('city'),
        zipcode: result.getValue('zipcode'),
        entityid: result.getValue('entityid'),
        // altname: result.getValue('altname'),
        pib: result.getValue('custentity_pib')
      }
    });
    return obj;
  }

  function getInputData() {
    try {
      // Obtain an object that represents the current script
      var script = runtime.getCurrentScript();

      var from = script.getParameter({
        name: 'custscript_popdv_date_from'
      });
      var to = script.getParameter({
        name: 'custscript_popdv_date_to'
      });
      var subsidiaryId = script.getParameter({
        name: 'custscript_kif_subsidiary'
      });

      var kifSavedSearch = createKIFSearch(from, to, subsidiaryId);
      var depSavedSearch = createDEPSearch(from, to, subsidiaryId);
      var entities = getEntities(subsidiaryId);

      var results = [],
        depResults = [],
        finalResults = [],
        start = 0,
        end = 1000;

      // This fixes the Results.each() limit of 4000 results
      while (true) {
        // getRange returns an array of Result objects
        var tempList = kifSavedSearch.run().getRange({
          start: start,
          end: end
        });

        if (tempList.length === 0) {
          break;
        }

        // Push tempList results into newResults array
        Array.prototype.push.apply(results, tempList);
        start += 1000;
        end += 1000;
      }

      start = 0;
      end = 1000;

      // This fixes the Results.each() limit of 4000 results
      while (true) {
        // getRange returns an array of Result objects
        var tempList1 = depSavedSearch.run().getRange({
          start: start,
          end: end
        });

        if (tempList1.length === 0) {
          break;
        }

        // Push tempList results into newResults array
        Array.prototype.push.apply(depResults, tempList1);
        start += 1000;
        end += 1000;
      }


      
      // log.debug('Check DEP result length',depSavedSearch.length);


      log.error('CHECK COUNT KIF',results.length);
      util.each(results, function (result) {
      
        var entityId = result.getValue({name: 'internalid', join: 'customer'});
        var res = {};
        var addr1 = (entities[entityId]) ? entities[entityId].address1 : '';
        var city = (entities[entityId]) ? entities[entityId].city : '';
        var country = (entities[entityId]) ? entities[entityId].country : '';
        var zipcode = (entities[entityId]) ? entities[entityId].zipcode : '';

        var finalAddress = addr1 + ' ' + city + '\n' + zipcode + ' ' + country;
        res["custbody_popdv_datum"] = result.getValue({name: "custbody_popdv_datum"});
        res["trandate"] = result.getValue({name: "trandate"});
        // res['customer'] = result.getValue({name: 'companyname', summary: "GROUP", join: 'customer'});
        res['customer'] = result.getText({name: "mainname"}) !=="" ? result.getText({name: "mainname"})  : 'Journal nadji polje ID';
        res['custaddress'] = finalAddress;
        res['pib'] = result.getValue({name: 'custentity_pib', join: 'customer'});
        res["type"] = result.getText({name: "type"});
        res["internalid"] = result.getValue({name: "internalid"});
        res['transactionnumber'] = result.getValue({name: 'transactionnumber'});
        res["tranid"] = result.getValue({name: "tranid"});
        res["totalwithpdv"] = parseFloat(result.getValue({name: "formulacurrency"}));
        //res["grossamount"] = parseFloat(result.getValue({name: "grossamount", summary: "SUM"}));
        res["taxamount"] = parseFloat(result.getValue({name: "taxamount"}));
        res["stopapdv"] = result.getValue({name: "taxrate", join: "taxDetail"});
        res['taxcode'] = result.getText({ name: 'taxcode',join: 'taxDetail'});
        res['taxcodeId'] = result.getValue({ name: 'taxcode',join: 'taxDetail'});
        res['desc'] = result.getValue({name: 'description', join: 'taxCode'});
        res['totalamount'] = result.getValue({name: 'totalamount'});
        var allValues = result.getAllValues();
        res['grossamount'] = parseFloat(allValues["formulacurrency_1"]);
        res['appliedtotransaction'] = '';
        res['memo'] = '';
        res['account'] = '';

        if (res.type === 'Journal') {

          var customerName = result.getText({name: "name"});

          var parts = customerName.split(' ');
          var customerId = parts[0];

          var entityId = getEntityForJournal(customerId, entities);

          var addr1 = (entities[entityId]) ? entities[entityId].address1 : '';
          var city = (entities[entityId]) ? entities[entityId].city : '';
          var country = (entities[entityId]) ? entities[entityId].country : '';
          var zipcode = (entities[entityId]) ? entities[entityId].zipcode : '';

          var finalAddress = addr1 + ' ' + city + '\n' + zipcode + ' ' + country;

          var entityAltName = (entityId) ? entities[entityId].altname : '';
          var entityIdFromSS = (entityId) ? entities[entityId].entityid : '';

          if (entityAltName !== '') {
            res['customer'] = entityAltName
          } else {
            res['customer'] = entityIdFromSS;
          }
          res['custaddress'] = finalAddress;
          res['pib'] = (entityId) ? entities[entityId].pib : '- None -';
        }
        if (res.type === 'Invoice' || res.type === 'Credit Memo' || res.type === 'Cash Sale') {
          res["trafficdate"] = result.getValue({name: "custbody_datumprometa"});
        } else if (res.type === 'Bill' || res.type === 'Bill Credit') {
          res["trafficdate"] = result.getValue({name: "custbody_rsm_bill_datum_prometa"});
        } else {
          res["trafficdate"] = '';
        }

        finalResults.push(res);
        return true;
      });

      util.each(depResults, function (result) {
        
        var entityId = result.getValue({name: 'entity'});
        var res = {};

        var addr1 = (entities[entityId]) ? entities[entityId].address1 : '';
        var city = (entities[entityId]) ? entities[entityId].city : '';
        var country = (entities[entityId]) ? entities[entityId].country : '';
        var zipcode = (entities[entityId]) ? entities[entityId].zipcode : '';

        var finalAddress = addr1 + ' ' + city + '\n' + zipcode + ' ' + country;

        res["custbody_popdv_datum"] = result.getValue({name: "custbody_popdv_datum"});
        res["trandate"] = result.getValue({name: "trandate"});
        res['customer'] = result.getValue({name: 'companyname', join: 'customer'});
        res['custaddress'] = finalAddress;
        res['pib'] = result.getValue({name: 'custentity_pib', join: 'customer'});
        res["type"] = result.getText({name: "type"});
        res["internalid"] = result.getValue({name: "internalid"});
        res["tranid"] = result.getValue({name: "tranid"});
        res["totalwithpdv"] = parseFloat(result.getValue({name: "amount"}));
        res["taxamount"] = parseFloat(result.getValue({name: "custbody_cust_dep_porez_iznos"}));
        res["stopapdv"] = result.getValue({name: "custrecord_tax_rate_rsm", join: "CUSTBODY_PORESKI_KOD_CUST_DEP_RSM"});
        res['taxcode'] = result.getText({name: 'custbody_poreski_kod_cust_dep_rsm'});
        res['taxcodeId'] = result.getValue({ name: 'taxcode',join: 'custbody_poreski_kod_cust_dep_rsm'});
        res['desc'] = result.getValue({name: 'description', join: 'custbody_poreski_kod_cust_dep_rsm'});
        res['isreversecharge'] = result.getValue({name: 'custrecord_isreversecharge', join: 'CUSTBODY_PORESKI_KOD_CUST_DEP_RSM'});
        res['appliedtotransaction'] = result.getText({name: 'appliedtotransaction'});
        res['account'] = '';
        res['memo'] = '';
        res["trafficdate"] = '';

        if (res['type'] === 'Deposit Application') {
          var rate = parseInt(res['stopapdv'].replace(/%/g, ''));

          res['taxamount'] = (res['isreversecharge']) ?
            -1 * Math.abs(res['totalwithpdv']) * (rate / 100) :
            -1 * Math.abs(res['totalwithpdv']) / (1 + rate / 100) * (rate / 100);
          res['taxamount'] = res['taxamount'];
          
        }

        res["grossamount"] = res["totalwithpdv"] - res["taxamount"];

        finalResults.push(res);
        return true;
      });


      finalResults.sort(function (a, b) {
        if (a["custbody_popdv_datum"] < b["custbody_popdv_datum"]) {
          return -1;
        } else if (a["custbody_popdv_datum"] > b["custbody_popdv_datum"]) {
          return 1;
        } else if (a["tranid"] < b["tranid"]) {
          return -1
        } else {
          return 1
        }
      });


      return finalResults;
    } catch (error) {
      log.error('ERROR! message', error.message);
      log.error('ERROR! stack', error.stack);    }
  }

  function map(context) {

    var result = JSON.parse(context.value);

    var invoices = [];
    if (result.type === "Deposit Application") {
      var rec = record.load({
        type: record.Type.DEPOSIT_APPLICATION,
        id: result.internalid
      });

      var lineCount = rec.getLineCount({sublistId: 'apply'});
      for (var i = 0; i < lineCount; i++) {
        if (rec.getSublistValue('apply', 'apply', i)) {
          var amt = rec.getSublistValue('apply', 'amount', i);
          var rate = parseInt(result.stopapdv.replace(/%/g, ''));
          var taxAmount = (result.isreversecharge) ? amt * (rate / 100) : amt / (1 + rate / 100) * (rate / 100);
          var currency = rec.getSublistValue('apply', 'currency', i);
          var exchangeRate = rec.getValue('exchangerate');
          if (currency !== 'Srpski dinar') {
            amt*=exchangeRate;
            taxAmount*=exchangeRate;
          }



          invoices.push({
            id: rec.getSublistValue('apply', 'internalid', i),
            refnum: rec.getSublistValue('apply', 'refnum', i),
            applydate: rec.getSublistValue('apply', 'applydate', i),
            due: rec.getSublistValue('apply', 'due', i),
            // netamount: (amt - taxAmount).toFixed(2),
            netamount: 0,
            // CHECK
            taxamount: taxAmount.toFixed(2),
            // amount: taxAmount.toFixed(2)
            amount:0
          });
        }
      }
    }


    var taxAmt, totalWithPdv;
    if (result.type === 'Journal') {
      taxAmt = ((result.grossamount) < 0) ? -Math.abs(result.taxamount) : Math.abs(result.taxamount);
      totalWithPdv = result.grossamount + taxAmt;
    }

    var totalAmountValue;
    if (result.type === 'Journal') {
      totalAmountValue = totalWithPdv
    } else {
      totalAmountValue = (result.totalamount) ? result.totalamount : result.totalwithpdv;
    }
  var taxAmountTemp = (taxAmt) ? taxAmt : result.taxamount;
    var calculatedGrossAmount = result.grossamount + taxAmountTemp;

    try {


      if(result.taxcodeId){
        var taxCodeRecord = record.load({
          type: record.Type.SALES_TAX_ITEM,
          id: result.taxcodeId
        });
        var taxCodeId = taxCodeRecord.getValue('description');
      }

      var data = {
        internalid: result.internalid,
        trandate: result.trandate,
        trafficdate: result.trafficdate,
        type: getTransactionTypeTranslation(result.type),
        tranid: result.tranid,
        trannumber: result.transactionnumber || result.tranid,
        customer: result.customer,
        custaddress: result.custaddress,
        pib: result.pib,
        account: result.account,
        memo: result.memo,
        // 2 TODO amount -> grossamount
        amount: parseFloat(result.grossamount).toFixed(2),
        grossamount: parseFloat(totalAmountValue).toFixed(2),
        calculatedGrossAmount: parseFloat(calculatedGrossAmount).toFixed(2),
        taxcode: result.taxcode,
        taxamount: (result.taxamount == null) ? 0 : (result.taxamount).toFixed(2),
        popdvdatum: result.custbody_popdv_datum,
        taxcodedesc: result.taxcode,
        taxCodeId: (taxCodeId) ? taxCodeRecord.getValue('description') : null,
        rate: result.stopapdv
      }
    
    } catch(error) {
      log.error('ERROR! message', error.message);
      log.error('ERROR! stack', error.stack);    
    }

    if (result.type === "Deposit Application") {
      log.debug('Check kako stigne invoices deposit ovde',invoices);
      data.invoices = invoices;
    }

    // log.audit('MAP END',data);

    context.write({
      //key: result.internalid,
      key: counter++,
      value: data
    });
  }

  function reduce(context) {
    context.write({
      key: context.key,
      value: JSON.parse(context.values[0])
    });
  }

  function summarize(summary) {

    // log.audit('inputSummary:Usage', summary.inputSummary.usage);
    // log.audit('inputSummary:Seconds', summary.inputSummary.seconds);
    // log.audit('inputSummary:Yields', summary.inputSummary.yields);
    // log.error('inputSummary:Error', summary.inputSummary.error);

    // log.audit('mapSummary:Usage', summary.mapSummary.usage);
    // log.audit('mapSummary:Seconds', summary.mapSummary.seconds);
    // log.audit('mapSummary:Yields', summary.mapSummary.yields);
    // log.error('mapSummary:Errors', summary.mapSummary.errors);

    // log.audit('reduceSummary:Usage', summary.reduceSummary.usage);
    // log.audit('reduceSummary:Seconds', summary.reduceSummary.seconds);
    // log.audit('reduceSummary:Yields', summary.reduceSummary.yields);
    // log.error('reduceSummary:Errors', summary.reduceSummary.errors);

    log.audit('Usage', summary.usage);
    log.audit('Seconds', summary.seconds);
    log.audit('Yields', summary.yields);

    // Grouping by tax item and calculating totals
    var groups = {};
    var customerDeposits = {};
    summary.output.iterator().each(function (key, value) {
      

      value = JSON.parse(value);


      if (value.type === 'Customer Deposit - Primljeni avansi') {
        // TODO customerDeposits.
        if (customerDeposits[value.taxcodedesc]) {
          if(value.taxCodeId){
            customerDeposits[value.taxcodedesc].taxdescription = value.taxCodeId;
          }
          customerDeposits[value.taxcodedesc].transactions.push(value);
          customerDeposits[value.taxcodedesc].total += parseFloat(value.calculatedGrossAmount);
          customerDeposits[value.taxcodedesc].nettotal += parseFloat(value.amount);
          customerDeposits[value.taxcodedesc].taxtotal += parseFloat(value.taxamount);
        } else {
          if(value.taxCodeId){
            var taxCodeDescription = value.taxCodeId;
           }
           
          customerDeposits[value.taxcodedesc] = {
            name: value.taxcode,
            transactions: [value],
            total: parseFloat(value.calculatedGrossAmount),
            nettotal: parseFloat(value.amount),
            taxtotal: parseFloat(value.taxamount),
            taxdescription:  taxCodeDescription

          }
        }
      } else {
        if (groups[value.taxcodedesc]) {

          if(value.type=="Deposit Application - Primljeni avansi sadržani u konačnoj izlaznoj fakturi"){
            var nettTotal = 0;
            var calculatedGrossAmount = 0; // remove and add zero value after check, current  7385646.76	
          }else{
            var nettTotal = value.amount;
            var calculatedGrossAmount = value.calculatedGrossAmount;
          }


          // 7385646.76	
          if(value.taxCodeId){
            groups[value.taxcodedesc].taxdescription = value.taxCodeId;
          }

          groups[value.taxcodedesc].transactions.push(value);
          groups[value.taxcodedesc].total += parseFloat(calculatedGrossAmount);
          groups[value.taxcodedesc].nettotal += parseFloat(nettTotal);
          groups[value.taxcodedesc].taxtotal += parseFloat(value.taxamount);
        } else {
          if(value.taxCodeId){
           var taxCodeDescription = value.taxCodeId;
          }

          if(value.type=="Deposit Application - Primljeni avansi sadržani u konačnoj izlaznoj fakturi"){
            var nettTotal = 0;
            var calculatedGrossAmount = 0; // remove and add zero value after check, current  7385646.76	
          }else{
            var nettTotal = value.amount;
            var calculatedGrossAmount = value.calculatedGrossAmount;
          }



          groups[value.taxcodedesc] = {
            name: value.taxcode,
            transactions: [value],
            total: parseFloat(calculatedGrossAmount),
            nettotal: parseFloat(nettTotal),
            taxtotal: parseFloat(value.taxamount),
            taxdescription:  taxCodeDescription
          }
        }
      }
      return true;
      
    });

    // Creating array of previously generated groups - Array is suitable for freemarker template engine
    var outputArray = [];
    var customerDepositsArray = [];
    delete groups[''];
    for (var taxcodedesc in groups) {

      outputArray.push({
        desc: (groups[taxcodedesc].taxdescription) ? taxcodedesc + ' : ' + groups[taxcodedesc].taxdescription : "PROMET DOBARA U USLUGA PO OPSTOJ STOPI",
        transactions: groups[taxcodedesc].transactions,
        total: groups[taxcodedesc].total.toFixed(2),
        nettotal: groups[taxcodedesc].nettotal.toFixed(2),
        taxtotal: groups[taxcodedesc].taxtotal.toFixed(2)
      });
    }
    for (var taxcodedesc in customerDeposits) {
      customerDepositsArray.push({
        desc: (customerDeposits[taxcodedesc].taxdescription) ? taxcodedesc + ' : ' + customerDeposits[taxcodedesc].taxdescription : taxcodedesc,
        transactions: customerDeposits[taxcodedesc].transactions,
        total: customerDeposits[taxcodedesc].total.toFixed(2),
        nettotal: customerDeposits[taxcodedesc].nettotal.toFixed(2),
        taxtotal: customerDeposits[taxcodedesc].taxtotal.toFixed(2)
      })
    }

    var data = {
      outputArray: outputArray,
      customerDepositsArray: customerDepositsArray
    }

    var createAtStamp = createdAt();

    
    var outputFile = file.create({
      name: 'kif_' + createAtStamp + '.json',
      fileType: file.Type.JSON,
      contents: JSON.stringify(data),
      folder: file.load({
        id: './output_data/flagfile'
      }).folder
    });
    outputFile.save();
    var fileId = file.load({
      id: './output_data/kif_' + createAtStamp + '.json'
    }).id;

    // Create new custom kif kuf record here and link outputFile to it
    // Obtain an object that represents the current script
    var script = runtime.getCurrentScript();
    var from = script.getParameter({
      name: 'custscript_popdv_date_from'
    });
    var to = script.getParameter({
      name: 'custscript_popdv_date_to'
    });
    var subsidiary = script.getParameter({
      name: 'custscript_kif_subsidiary'
    });

    var rec = record.create({
      type: 'customrecord_kif_kuf_data',
    });
    rec.setValue({
      fieldId: 'name',
      value: 'POPDV data' + from + " - " + to
    });
    rec.setValue({
      fieldId: 'custrecord_report_type',
      value: 'kif'
    });
    rec.setValue({
      fieldId: 'custrecord_kif_kuf_data_subsidiary',
      value: subsidiary
    });
    rec.setValue({
      fieldId: 'custrecord_popdv_date_from',
      value: from
    });
    rec.setValue({
      fieldId: 'custrecord_popdv_date_to',
      value: to
    });
    rec.setValue({
      fieldId: 'custrecord_created_at',
      value: createAtStamp
    });
    rec.setValue({
      fieldId: 'custrecord_file_document',
      value: fileId
    });
    rec.setValue({
      fieldId: 'custrecord_kif_kuf_data_user',
      value: runtime.getCurrentUser().name
    });
    rec.save();
  }

  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };

});