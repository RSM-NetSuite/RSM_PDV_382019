/**
 * @NApiVersion 2.0
 * @NScriptType ClientScript
 * @NModuleScope SameAccount 
 */
define(['N/ui/message', 'N/url', 'N/https', 'N/log', 'N/currentRecord'],
  function (message, url, https, log, currentRecord) {

    var msgTypes = {
      'confirmation': message.Type.CONFIRMATION,
      'information': message.Type.INFORMATION,
      'warning': message.Type.WARNING,
      'error': message.Type.ERROR
    };

    function pageInit(context) { }

    function callRestlet(data, restletIds, errorMessageTitle) {
      // Resolve restlet url
      var restletUrl = url.resolveScript({
        scriptId: restletIds.scriptId,
        deploymentId: restletIds.deploymentId
      });

      // Generate request headers
      var headers = new Array();
      headers['Content-type'] = 'application/json';

      // https POST request - returns promise object
      https.post.promise({
        url: restletUrl,
        headers: headers,
        body: data
      }).then(function (response) {
        var res = JSON.parse(response.body);
        message.create({
          type: msgTypes[res.message.type],
          title: res.message.title,
          message: res.message.message,
          duration: res.message.duration || 5000
        }).show();
      }).catch(function (err) {
        log.error(errorMessageTitle, "Error message: " + err);
      });
    }

    function createBillIO() {
      message.create({
        type: msgTypes['information'],
        title: "Akcija",
        message: "Kreiranje PDF dokumenta internog obracuna je u toku...",
        duration: 5000
      }).show();

      // Get current record 
      var currRec = currentRecord.get();

      // Prepare restlet parameters
      var data = {
        action: 'createbillio',
        transactionId: currRec.id,

      };

      callRestlet(data, {
        scriptId: 'customscript_rsm_bill_io_rl',
        deploymentId: 'customdeploy_rsm_bill_io_rl'
      }, "Greska prilikom generisanja PDF dokumenta internog obracuna!");
    }

    function createBillCreditIO() {
      message.create({
        type: msgTypes['information'],
        title: "Akcija",
        message: "Kreiranje PDF dokumenta internog obracuna je u toku...",
        duration: 5000
      }).show();

      // Get current record 
      var currRec = currentRecord.get();

      // Prepare restlet parameters
      var data = {
        action: 'createbillcreditio',
        transactionId: currRec.id,

      };

      callRestlet(data, {
        scriptId: 'customscript_rsm_bill_credit_io_rl',
        deploymentId: 'customdeploy_rsm_bill_credit_io_rl'
      }, "Greska prilikom generisanja PDF dokumenta internog obracuna!");
    }

    function createJournalIO() {
      message.create({
        type: msgTypes['information'],
        title: "Akcija",
        message: "Kreiranje PDF dokumenta internog obracuna je u toku...",
        duration: 5000
      }).show();

      // Get current record 
      var currRec = currentRecord.get();

      // Prepare restlet parameters
      var data = {
        action: 'createjournalio',
        transactionId: currRec.id,

      };

      callRestlet(data, {
        scriptId: 'customscript_rsm_journal_entry_io_rl',
        deploymentId: 'customdeploy_rsm_journal_entry_io_rl'
      }, "Greska prilikom generisanja PDF dokumenta internog obracuna!");
    }
    return {
      pageInit: pageInit,
      createBillIO: createBillIO,
      createBillCreditIO: createBillCreditIO,
      createJournalIO: createJournalIO,
    };

  });