define(['N/log', 'N/record', 'N/search'], function (log, record, search) {

  function getKufData (from, to, subsidiaryId) {
    var billSrch = search.create({
      type: search.Type.TRANSACTION,
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters: [
        ['custbody_popdv_datum', 'within', from, to],
        'AND',
        ['subsidiary', 'is', subsidiaryId],
        "AND",
        // ["accounttype","anyof","OthExpense","DeferRevenue","DeferExpense","OthCurrAsset","FixedAsset","OthAsset","OthCurrLiab","LongTermLiab","Income","Expense","OthIncome"], 
        // "AND", 
        // ["account","noneof","338","990","991","992","993","994","1696","337","394","240","241","243","244","251","252","253","254","290","256","257","267","1940","902","269","270","271","272","1699","273","274","275","276","277","278","281","283","293","299","300","301","304","305","306","392","393","639"], 
        // "AND", 
        ["type","noneof","VPrepApp","VPrep","CustInvc"]
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
        // TODO TEST REAMAIN FIELDS
        search.createColumn({
          name: 'tranestgrossprofit',
          label: 'Amount (tranestgrossprofit)'
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
          name: 'formulacurrency',
          formula:
            "CASE WHEN ({accounttype}='Other Current Liability' OR {accounttype}='Long Term Liability' OR {accounttype}='Deferred Revenue')AND {debitamount}>0 THEN {amount}*(-1)WHEN ({accounttype}='Bank' OR {accounttype}='Other Current Asset' OR {accounttype}='Fixed Asset' OR {accounttype}='Other Asset' OR {accounttype}='Deffered Expense')AND {creditamount}>0 THEN {amount}*(-1)ELSE {amount}END"
        })
      ]
    })

    var tempList = []

    var searchResult = billSrch.run().getRange({
      start: 0,
      end: 1000 // Maximum number of records to retrieve
    })

    var transactionWithTaxCode = []

    Array.prototype.push.apply(tempList, searchResult)

    util.each(tempList, function (result) {

        var taxRate = result.getValue({
        name: 'taxrate',
        join: 'taxDetail'
      })

      if (taxRate !== '') {
        transactionWithTaxCode.push(result)
      }
    })

    return transactionWithTaxCode
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
          ["type", "anyof", "VPrep", "VPrepApp"],
          "AND",
          ["mainline", "is", "T"],
          "AND",
          ["subsidiary", "is", subsidiaryId],
          "AND",
          ["posting","is","T"]
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
          search.createColumn({ name: "transactionnumber", label: "Transaction Number" }),
          search.createColumn({ name: "entity", label: "Name" }),
          search.createColumn({ name: 'entityid', join: 'vendor' }),
          search.createColumn({ name: 'companyname', join: 'vendor' }),
          search.createColumn({ name: 'custentity_pib', join: 'vendor' }),
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
            label: "RATE"
         }),
         search.createColumn({
            name: "taxtype",
            join: "CUSTBODY_PORESKI_KOD_CUST_DEP_RSM",
            label: "Tax Type"
         }),
         search.createColumn({
            name: "custrecord_isreversecharge",
            join: "CUSTBODY_PORESKI_KOD_CUST_DEP_RSM",
            label: "Reverse Charge Code"
         }),
          // TODO Load Tax Item data
          search.createColumn({ name: "internalid", label: "Internal ID" }),
          search.createColumn({ name: 'appliedtotransaction' })
        ]
    });
  }


  return {
    getKufData: getKufData,
    getEntities: getEntities,
    createDEPSearch:createDEPSearch
  }
})
