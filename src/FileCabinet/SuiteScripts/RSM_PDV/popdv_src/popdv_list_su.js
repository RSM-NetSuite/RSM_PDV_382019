/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */

define(["N/ui/serverWidget", "N/search","N/log"], function (serverWidget, search,log) {

  /**
   * Create and return NetSuite search.Search object
   * @param {string} dateStart 
   * @param {string} dateEnd 
   * @returns {search.Search} NetSuite search.Search object which has method run() to get search.ResultSet
   */
  function createPopdvSavedSearch(dateStart, dateEnd, subsidiaryId) {
    var dateFilter = (dateStart && dateEnd) ? ["custbody_popdv_datum", "within", dateStart, dateEnd] : ["custbody_popdv_datum", "within", "lastmonth"];

    return search.create({
      type: "transaction",
      settings: [
        {
          name: 'consolidationtype',
          value: 'NONE'
        }
      ],
      filters: [
        ["taxcode.country", "anyof", "RS"],
        "AND",
        ["subsidiary", "anyof", subsidiaryId],
        "AND",
        ["posting", "is", "T"],
        "AND",
        dateFilter,
        'AND',
        [
          ["taxcode.custrecord_4110_import","is","F"],
          'OR',
          ['taxcode.custrecord_isexport', 'is', 'F']
        ]
      ],
      columns: [
        search.createColumn({
          name: "amount",
          summary: "SUM",
          label: "Amount"
       }),
       search.createColumn({
          name: "name",
          join: "taxCode",
          summary: "GROUP",
          label: "Name"
       }),
       search.createColumn({
        // name: "taxamount",
        name: "formulacurrency",
        summary: "SUM",
        formula: "-1*{taxtotal}-{amount}",
        label: "Tax Amount"
     })
      ]
    });
  }

  /**
   * Create NetSuite serverWidget.List object and return it
   * @returns {serverWidget.List} NetSuite serverWidget.List object
   */
  function createPopdvList() {
    var list = serverWidget.createList({
      title: "POPDV List"
    });
    list.style = serverWidget.ListStyle.REPORT;
    list.clientScriptModulePath = "./popdv_list_cs.js";

    list.addButton({
      id: "exportPdf",
      label: "Export PDF",
      functionName: "exportPdf"
    });

    list.addButton({
      id: "exportXml",
      label: "Export XML",
      functionName: "exportXml"
    });
    list.addButton({
      id: 'exportXls',
      label: "Export XLS",
      functionName: "exportXls"
    });
    list.addButton({
      id: 'exportValidationXls',
      label: "Export Validation XLS",
      functionName: "exportValidation"
    });

    list.addColumn({
      id: "name",
      type: serverWidget.FieldType.TEXT,
      label: "TAX ITEM",
      align: serverWidget.LayoutJustification.RIGHT
    });

    list.addColumn({
      id: "amount",
      type: serverWidget.FieldType.TEXT,
      label: "Amount",
      align: serverWidget.LayoutJustification.RIGHT
    });

    list.addColumn({
      id: "taxamount",
      type: serverWidget.FieldType.TEXT,
      label: "Amount (Tax)",
      align: serverWidget.LayoutJustification.RIGHT
    });

    return list;
  }

  // Suitelet entry-point function
  function onRequest(context) {
    if (context.request.method === "GET") {
      var popdvSavedSearch = createPopdvSavedSearch(
        context.request.parameters.datestart,
        context.request.parameters.dateend,
        context.request.parameters.subsidiary
      );
      var list = createPopdvList();
      var results = [];

      popdvSavedSearch.run().each(function (result) {
        log.debug('Check resutl',result);
        var res = {};
        res["name"] = result.getValue({
          name: "name",
          join: "taxCode",
          summary: search.Summary.GROUP,
        });
        res["taxamount"] = result.getValue({
          name: "formulacurrency",
          formula: "-1*{taxtotal}-{amount}",
          summary: search.Summary.SUM
        });
        res["amount"] = result.getValue({
          name: "amount",
          summary: search.Summary.SUM
        });

        results.push(res);
        return true;
      });

      log.debug('Check results',JSON.stringify(results));
      list.addRows({
        rows: results
      });

      context.response.writePage(list);
    } else {
      context.response.write("404");
    }
  }

  return {
    onRequest: onRequest
  };
});
