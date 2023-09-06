/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/file', 'N/runtime', 'N/log','./document_helper/rsm_kuf_collector'], function (record, search, file, runtime, log,kufcollector) {

  var counter = 0;

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
      case "Vendor Prepayment":
        returnValue = 'Vendor Prepayment - Dati avansi';
        break;
      case "Vendor Prepayment Application":
        returnValue = 'Vendor Prepayment Application - Dati avansi sadržani u konačnoj izlaznoj fakturi';
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



  function getInputData() {
    try {


      // Obtain an object that represents the current script
      var script = runtime.getCurrentScript();

      var from = script.getParameter({
        name: 'custscript_kuf_popdv_date_from'
      });
      var to = script.getParameter({
        name: 'custscript_kuf_popdv_date_to'
      });
      var subsidiaryId = script.getParameter({
        name: 'custscript_kuf_subsidiary'
      });

      var depSavedSearch = kufcollector.createDEPSearch(from, to, subsidiaryId);
      var entities = kufcollector.getEntities(subsidiaryId);

       var depResults = [],
        generalResults = [],
        start = 0,
        end = 1000;

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
    

      // CHECK DATA 
      var result2 = kufcollector.getKufData(from,to,subsidiaryId);

      // TODO MILAN Check results, da li je nesto stiglo dovde
      util.each(result2, function (result) {
        var entityId = result.getValue({name: 'internalid', join: 'vendor'});

        var res = {};

        var addr1 = (entities[entityId]) ? entities[entityId].address1 : '';
        var city = (entities[entityId]) ? entities[entityId].city : '';
        var country = (entities[entityId]) ? entities[entityId].country : '';
        var zipcode = (entities[entityId]) ? entities[entityId].zipcode : '';

        var finalAddress = addr1 + ' ' + city + '\n' + zipcode + ' ' + country;
        res['custaddress'] = finalAddress;
        res["custbody_popdv_datum"] = result.getValue({name: "custbody_popdv_datum"});
        res["trandate"] = result.getValue({name: "trandate"});
        // res['customer'] = result.getValue({name: 'companyname', join: 'vendor'});
        res['customer'] = result.getText({name: "mainname"}) !=="" ? result.getText({name: "mainname"})  : 'Journal nadji polje ID';
        res['custaddress'] = finalAddress;
        res['pib'] = result.getValue({name: 'custentity_pib', join: 'vendor'});
        res["type"] = result.getText({name: "type"});
        res["internalid"] = result.getValue({name: "internalid"});
        res['transactionnumber'] = result.getValue({name: 'transactionnumber'});
        res["tranid"] = result.getValue({name: "tranid"});
        res["totalwithpdv"] = parseFloat(result.getValue({name: "formulacurrency"}));
        //res["grossamount"] = parseFloat(result.getValue({name: "grossamount"}));
        res["taxamount"] = parseFloat(result.getValue({name: "taxamount"}));
        res["stopapdv"] = result.getValue({name: "taxrate", join: "taxDetail"});
        res['taxcode'] = result.getText({ name: 'taxcode',join: 'taxDetail'});
        res['taxcodeId'] = result.getValue({ name: 'taxcode',join: 'taxDetail'});
        res['desc'] = result.getValue({name: 'description', join: 'taxCode'});
        res['appliedtotransaction'] = '';
        res['account'] = result.getText({name: 'account'});
        res['memo'] = result.getValue({name: 'memo'});
        var allValues = result.getAllValues();
        res['grossamount'] = parseFloat(allValues["formulacurrency_1"]);

        if (res.type === 'Journal') {

          var entityId = result.getValue({name: 'name'});


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
            res['customer'] = entityIdFromSS
          }

          res['custaddress'] = finalAddress;
          res['pib'] = (entityId) ? entities[entityId].pib : '';
        }
        if (res.type === 'Invoice' || res.type === 'Credit Memo' || res.type === 'Cash Sale') {


          res["trafficdate"] = result.getValue({name: "custbody_datumprometa"});
        } else if (res.type === 'Bill' || res.type === 'Bill Credit') {

          res["trafficdate"] = result.getValue({name: "custbody_rsm_bill_datum_prometa"});
        } else {

          res["trafficdate"] = '';
        }

      // TODO Probaj ovde da iskljucis, da ne ubaci taj rezultat ako je uslov, available_on, PURCHASE
        generalResults.push(res);

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
        res['customer'] = result.getValue({name: 'companyname', join: 'vendor'});
        res['custaddress'] = finalAddress;
        res['pib'] = result.getValue({name: 'custentity_pib', join: 'vendor'});
        res["type"] = result.getText({name: "type"});
        res["internalid"] = result.getValue({name: "internalid"});
        res["tranid"] = result.getValue({name: "tranid"});
        res["transactionnumber"] = result.getValue({name: "transactionnumber"});
        res["totalwithpdv"] = parseFloat(result.getValue({name: "amount"}));
        res["taxamount"] = parseFloat(result.getValue({name: "custbody_cust_dep_porez_iznos"}));
        res["stopapdv"] = result.getValue({name: "custrecord_tax_rate_rsm", join: "CUSTBODY_PORESKI_KOD_CUST_DEP_RSM"});
        res['taxcode'] = result.getText({name: 'custbody_poreski_kod_cust_dep_rsm'});
        res['taxcodeId'] = result.getValue({name: 'custbody_poreski_kod_cust_dep_rsm'});
        res['parent'] = result.getValue({name: 'taxtype', join: 'CUSTBODY_PORESKI_KOD_CUST_DEP_RSM'});
        res['desc'] = result.getValue({name: 'description', join: 'taxCode'});
        res['isreversecharge'] = result.getValue({name: 'custrecord_isreversecharge', join: 'CUSTBODY_PORESKI_KOD_CUST_DEP_RSM'});
        res['appliedtotransaction'] = result.getText({name: 'appliedtotransaction'});
        res['account'] = result.getText({name: 'account'});
        res['memo'] = result.getValue({name: 'memo'});
        res["grossamount"] = res["totalwithpdv"] - res["taxamount"];
        res["trafficdate"] = '';



        // TODO Probaj ovde da iskljucis
        generalResults.push(res);
        return true;
      });

      
      generalResults.sort(function (a, b) {


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

      return generalResults;
    } catch (error) {
      log.error('ERROR! message', error.message);
      log.error('ERROR! stack', error.stack);

    }

  }

  function map(context) {
    var result = JSON.parse(context.value);
    var bills = [];
    if (result.type === "Vendor Prepayment Application") {

      var rec = record.load({
        type: record.Type.VENDOR_PREPAYMENT_APPLICATION,
        id: result.internalid
      });
      var lineCount = rec.getLineCount({ sublistId: 'bill' });
      for (var i = 0; i < lineCount; i++) {
        if (rec.getSublistValue('bill', 'apply', i)) {
          var amt = rec.getSublistValue('bill', 'amount', i);
          // amt = -1 * Math.abs(amt);
          var rate = parseInt(result.stopapdv.replace(/%/g, ''));
          var taxAmt = amt / (1 + rate / 100) * (rate / 100);
          var currency = rec.getSublistValue('bill', 'currency', i);
          var exchangeRate = rec.getValue('exchangerate');
          if (currency !== 'Srpski dinar') {
            amt *= exchangeRate;
            taxAmt *= exchangeRate;
          }
          if (result.isreversecharge) {
              rate = record.load({
                type: record.Type.SALES_TAX_ITEM,
                id: result.parent
              }).getValue('custrecord_tax_rate_rsm');
              rate = parseInt(rate);
              taxAmt = 0;
          }
          bills.push({
            id: rec.getSublistValue('bill', 'internalid', i),
            refnum: rec.getSublistValue('bill', 'refnum', i),
            applydate: rec.getSublistValue('bill', 'billdate', i),
            due: rec.getSublistValue('bill', 'due', i),
            netamount: 0,
            taxamount: taxAmt.toFixed(2),
            amount: taxAmt.toFixed(2)
            // taxAmt
          });
        }
      }
    }
    var netAmount = null,
      taxAmount = null,
      grossAmount = null;
    // if (result.isreversecharge) {
    if (result.type === "Vendor Prepayment Application") {
      netAmount = -1 * Math.abs(result.totalwithpdv);
      taxAmount = -1 * Math.abs(result.taxamount);
      if (result.isreversecharge) {
        taxAmount = 0;
      }
      grossAmount = netAmount + taxAmount;
    } else if (result.type === "Vendor Prepayment") {
      if (result.isreversecharge) {
        netAmount = Math.abs(result.totalwithpdv);
        taxAmount = 0;
        grossAmount = netAmount + taxAmount;
      } else {
        netAmount = Math.abs(result.totalwithpdv) - Math.abs(result.taxamount);
        taxAmount = Math.abs(result.taxamount);
        grossAmount = netAmount + taxAmount;
      }
    } else {
      netAmount = result.grossamount;
      taxAmount = (netAmount < 0) ? -1 * Math.abs(result.taxamount) : Math.abs(result.taxamount);
      grossAmount = netAmount + taxAmount;
    }

    if(result.taxcodeId){
      var taxCodeRecord = record.load({
        type: record.Type.SALES_TAX_ITEM,
        id: result.taxcodeId
      });



      var taxCodeId = taxCodeRecord.getValue('description');

    }


      // TODO Probaj ovde da iskljucis

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
      amount: netAmount.toFixed(2),
      grossamount: grossAmount.toFixed(2),
      calculatedGrossAmount: grossAmount.toFixed(2),
      taxcode: result.taxcode,
      taxamount: taxAmount.toFixed(2),
      popdvdatum: result.custbody_popdv_datum,
      taxcodedesc: result.taxcode,
      taxdesc: result.description,
      taxCodeId: (taxCodeId) ? taxCodeRecord.getValue('description') : null,
      rate: result.stopapdv
    }
    if (result.type === "Vendor Prepayment Application") {
      data.bills = bills;
    }

    if(taxCodeRecord.getText('custpage_availableon') =='Both' || taxCodeRecord.getText('custpage_availableon') =='Purchase transactions' ){
    context.write({
      // key: result.internalid,
      key: counter++,
      value: data
    });
  }
  }

  function reduce(context) {
    context.write({
      key: context.key,
      value: JSON.parse(context.values[0])
    });
  }

  function summarize(summary) {


    log.audit('Usage', summary.usage);
    log.audit('Seconds', summary.seconds);
    log.audit('Yields', summary.yields);

    // Grouping by tax item and calculating totals
    var groups = {};

    summary.output.iterator().each(function (key, value) {
      value = JSON.parse(value);

      if (groups[value.taxcodedesc]) {
        groups[value.taxcodedesc].transactions.push(value);
        if (value.type === "Vendor Prepayment Application - Dati avansi sadržani u konačnoj izlaznoj fakturi") {
          for (var i = 0; i < value.bills.length; i++) {
            if(value.taxCodeId){
              groups[value.taxcodedesc].taxdescription = value.taxCodeId;
            }
            groups[value.taxcodedesc].total -= parseFloat(value.bills[i].amount);
            groups[value.taxcodedesc].nettotal -= parseFloat(value.bills[i].netamount);
            groups[value.taxcodedesc].taxtotal -= parseFloat(value.bills[i].taxamount);
          }

        } else {
          if(value.taxCodeId){
            groups[value.taxcodedesc].taxdescription = value.taxCodeId;
          }
          groups[value.taxcodedesc].total += parseFloat(value.grossamount);
          groups[value.taxcodedesc].nettotal += parseFloat(value.amount);
          groups[value.taxcodedesc].taxtotal += parseFloat(value.taxamount);
        }
      } else {
        if (value.type === "Vendor Prepayment Application - Dati avansi sadržani u konačnoj izlaznoj fakturi") {
          for (var i = 0; i < value.bills.length; i++) {
            if(value.taxCodeId){
              var taxCodeDescription = value.taxCodeId;
             }
            groups[value.taxcodedesc] = {
              name: value.taxcode,
              transactions: [value],
              total: -parseFloat(value.bills[i].amount),
              nettotal: -parseFloat(value.bills[i].netamount),
              taxtotal: -parseFloat(value.bills[i].taxamount),
              taxdescription:  taxCodeDescription

            }
          }
        } else {
          if(value.taxCodeId){
            var taxCodeDescription = value.taxCodeId;
           }
          groups[value.taxcodedesc] = {
            name: value.taxcode,
            transactions: [value],
            total: parseFloat(value.grossamount),
            nettotal: parseFloat(value.amount),
            taxtotal: parseFloat(value.taxamount),
            taxdescription:  taxCodeDescription
          }
        }
      }
      return true;
    });


    // Creating array of previously generated groups - Array is suitable for freemarker template engine
    var outputArray = [];

    for (var taxcodedesc in groups) {

      outputArray.push({
        desc: (groups[taxcodedesc].taxdescription) ? taxcodedesc + ' : ' + groups[taxcodedesc].taxdescription : taxcodedesc,
        transactions: groups[taxcodedesc].transactions,
        total: groups[taxcodedesc].total.toFixed(2),
        nettotal: groups[taxcodedesc].nettotal.toFixed(2),
        taxtotal: groups[taxcodedesc].taxtotal.toFixed(2)
      });
    }

    // TODO add overall data
    // log.debug('Get all groups',outputArray);
    var data = {
      outputArray: outputArray
    }

    var createdAtStamp = createdAt();

    var outputFile = file.create({
      name: 'kuf_' + createdAtStamp + '.json',
      fileType: file.Type.JSON,
      contents: JSON.stringify(data),
      folder: file.load({
        id: './output_data/flagfile'
      }).folder
    });
    outputFile.save();

    var fileId = file.load({
      id: './output_data/kuf_' + createdAtStamp + '.json'
    }).id;

    // Create new custom kif kuf record here and link outputFile to it
    // Obtain an object that represents the current script
    var script = runtime.getCurrentScript();
    var from = script.getParameter({
      name: 'custscript_kuf_popdv_date_from'
    });
    var to = script.getParameter({
      name: 'custscript_kuf_popdv_date_to'
    });
    var subsidiary = script.getParameter({
      name: 'custscript_kuf_subsidiary'
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
      value: 'kuf'
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
      value: createdAtStamp
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