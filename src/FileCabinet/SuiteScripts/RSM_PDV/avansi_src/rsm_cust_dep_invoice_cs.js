/**
 * @NApiVersion 2.0
 * @NScriptType ClientScript
 * @NModuleScope Public
 * 
 * Client script functionality which calls cust-dep and invoice restlets with actions to create pdf files and 
 * send it via E-mail. 
 * Shows appropriate messages using restlet response.
 * 
 */

define(['N/currentRecord', 'N/record', 'N/url', 'N/https', 'N/ui/message', 'N/format', 'N/log', './customDialog.js'],
  function (currentRecord, record, url, https, message, format, log, customDialog) {

    var cDialog = customDialog.customDialog;
    var msgTypes = {
      'confirmation': message.Type.CONFIRMATION,
      'information': message.Type.INFORMATION,
      'warning': message.Type.WARNING,
      'error': message.Type.ERROR
    };

    function formatDate(date) {
      return format.format({
        value: date,
        type: format.Type.DATETIME,
        timezone: format.Timezone.EUROPE_BUDAPEST
      });
    }

    /**
     * Disables or enables button depending on the value isCreated which tells if JE tran. has been created or not
     * @param {boolean} disable tells if element should be disabled or not
     */
    function _disableButton(btnId, disable) {
      document.getElementById(btnId).disabled = (disable) ? 'disabled' : '';
    };

    /**
     * Helper function to call a resltet with passed data parameters
     * @param {object} data 
     * @param {object} rlIds
     * @param {object} rlIds.scriptId restlet script id
     * @param {object} rlIds.deploymentId restlet deployment id
     * @param {string} errorMessageTitle
     */
    function _callRestlet(data, rlIds, errorMessageTitle) {
      // Resolve restlet url
      var restletUrl = url.resolveScript({
        scriptId: rlIds.scriptId,
        deploymentId: rlIds.deploymentId
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
        if (res.linkToRecord) {
          window.location.href = res.linkToRecord;
        }
        message.create({
          type: msgTypes[res.message.type],
          title: res.message.title,
          message: res.message.message,
          duration: res.message.duration || 5000
        }).show();

        if (data.action === 'createJournal1' || data.action === 'createJournal2') {
          if (res.isCreated) {
            setTimeout(function () {
              window.location.reload();
            }, 5000);
          } else {
            var btnId = (data.action === 'createJournal1') ? 'custpage_poresko_oslobodjenje_bez_potvrde' : 'custpage_poresko_oslobodjenje';
            _disableButton(btnId, false);
          }
        }
      }).catch(function (err) {
        log.error(errorMessageTitle, "Error message: " + err);
      });
    }

    /**
     * Calls resltet with parameters to create customer deposit pdf document
     */
    function createCustomerDepositPdf() {
      message.create({
        type: msgTypes['information'],
        title: "Akcija",
        message: "Kreiranje PDF fakture je u toku...",
        duration: 5000
      }).show();

      // Get current record 
      var currRec = currentRecord.get();
      var loadedRecord = record.load({
        type: currRec.type,
        id: currRec.id
      });

      var amount = loadedRecord.getValue('payment');

      // Prepare restlet parameters
      var data = {
        action: 'createpdf',
        custDepId: currRec.id,
        tranId: loadedRecord.getValue('tranid'),
        tranDate: formatDate(loadedRecord.getValue('trandate')),
        // tranDate: format.format({
        //   value: loadedRecord.getValue('trandate'),
        //   type: format.Type.DATETIME,
        //   timezone: format.Timezone.EUROPE_BUDAPEST
        // }),
        taxRate: loadedRecord.getValue('custbody_cust_dep_poreska_stopa'),
        amount: parseFloat(amount.toFixed(2)),
        taxAmount: parseFloat(parseFloat(loadedRecord.getValue('custbody_cust_dep_porez_iznos')).toFixed(2)),
        salesOrder: loadedRecord.getText('salesorder'),
        memo: loadedRecord.getValue('memo'),
        location: loadedRecord.getText('location'),
        customer: loadedRecord.getValue('customer')
      };

      _callRestlet(data, {
        scriptId: 'customscript_rsm_cust_dep_rl',
        deploymentId: 'customdeploy_rsm_cust_dep_rl'
      }, "Error during customer deposit PDF invoice creation");
    }

    /**
     * Calls restlet with parameters to email customer deposit pdf document
     */
    function emailCustomerDepositPdf() {
      if (confirm("Da li ste sigurni da zelite da posaljete PDF fakturu?")) {
        message.create({
          type: msgTypes['information'],
          title: "Akcija",
          message: "Slanje PDF fakture preko Email-a je u toku...",
          duration: 5000
        }).show();

        // Get current record
        var currRec = currentRecord.get();
        var loadedRecord = record.load({
          type: currRec.type,
          id: currRec.id
        });

        // Prepare resltet parameters
        data = {
          action: 'emailpdf',
          custDepId: currRec.id,
          location: loadedRecord.getText('location')
        };

        _callRestlet(data, {
          scriptId: 'customscript_rsm_cust_dep_rl',
          deploymentId: 'customdeploy_rsm_cust_dep_rl'
        }, "Error during customer deposit PDF invoice creation");
      }
    }

    /**
     * Calls restlet with parameters to create invoice pdf document
     */
    function createInvoicePdf() {
      message.create({
        type: msgTypes['information'],
        title: "Akcija",
        message: "Kreiranje PDF fakture je u toku...",
        duration: 5000
      }).show();

      // Get current record
      var currRec = currentRecord.get();

      // Prepare resltet parameters
      var data = {
        action: 'createpdf',
        invoiceId: currRec.id
      };

      _callRestlet(data, {
        scriptId: 'customscript_rsm_invoice_rl',
        deploymentId: 'customdeploy_rsm_invoice_rl'
      }, "Error during invoice PDF invoice creation");
    }

    /**
     * Calls restlet with parameters to email invoice pdf document
     */
    function emailInvoicePdf() {
      if (confirm("Da li ste sigurni da zelite da posaljete PDF fakturu?")) {
        message.create({
          type: msgTypes['information'],
          title: "Akcija",
          message: "Slanje PDF fakture preko Email-a je u toku...",
          duration: 5000
        }).show();

        // Get current record
        var currRec = currentRecord.get();
        var loadedRecord = record.load({
          type: currRec.type,
          id: currRec.id
        });

        // Prepare resltet parameters
        var data = {
          action: 'emailpdf',
          invoiceId: currRec.id,
          location: loadedRecord.getText('location')
        };

        _callRestlet(data, {
          scriptId: 'customscript_rsm_invoice_rl',
          deploymentId: 'customdeploy_rsm_invoice_rl'
        }, "Error during customer deposit PDF invoice creation");
      }
    }

    function createKnjiznoZaduzenje() {
      if (confirm("Da li ste sigurni da zelite da kreirate knjizno zaduzenje?")) {
        var currRec = currentRecord.get();

        message.create({
          type: msgTypes['information'],
          titple: 'Akcija',
          message: "Generisanje knjiznog zaduzenja je u toku",
          duration: 5000
        }).show();

        _disableButton('custpage_knjizno_zaduzenje', true);

        var data = {
          action: 'createKnjiznoZaduzenje',
          invoiceId: currRec.id
        }

        _callRestlet(data, {
          scriptId: 'customscript_rsm_invoice_rl',
          deploymentId: 'customdeploy_rsm_invoice_rl'
        }, "Error during creation of 'Knjizno zaduzenje' from Invoice");
      }
    }

    /**
    * Calls restlet with parameters to create journal entry transaction
    */
    function createPOJournalEntry1() {
      // Get current record
      var currRec = currentRecord.get();

      message.create({
        type: msgTypes['information'],
        title: "Akcija",
        message: "Generisanje JE transakcije je u toku...",
        duration: 5000
      }).show();

      _disableButton('custpage_poresko_oslobodjenje_bez_potvrde', true);

      var data = {
        action: 'createJournal1',
        invoiceId: currRec.id
      }

      _callRestlet(data, {
        scriptId: 'customscript_rsm_invoice_rl',
        deploymentId: 'customdeploy_rsm_invoice_rl'
      }, "Error during JE creation from Invoce");
    }

    /**
     * Calls restlet with parameters to create journal entry transaction - shows input dialog for date and number
     */
    function createPOJournalEntry2() {
      // Get current record
      var currRec = currentRecord.get();

      // Custom dialog 1
      cDialog.display({
        title: "Unos datuma potvrde za poresko oslobodjenje",
        inputType: 'date',
        inputLabel: "Unesite datum:",
        confirmBtnText: 'Ok',
        cancelBtnText: 'Odustani',
        callback: function (dialogValue1) {
          // Custom dialog 2
          cDialog.display({
            title: "Unos broja potvrde za poresko oslobodjenje",
            inputType: 'text',
            inputLabel: "Unesite broj:",
            confirmBtnText: 'Ok',
            cancelBtnText: 'Odustani',
            callback: function (dialogValue2) {
              message.create({
                type: msgTypes['information'],
                title: 'Information',
                message: "Postupak poreskog oslobodjenja je pokrenut. Generisanje Journal transakcije je u toku...",
                duration: 5000
              }).show();

              _disableButton('custpage_poresko_oslobodjenje', true);

              // Prepare resltet parameters
              var data = {
                action: 'createJournal2',
                invoiceId: currRec.id,
                datumPotvrde: dialogValue1,
                brojPotvrde: dialogValue2
              };

              _callRestlet(data, {
                scriptId: 'customscript_rsm_invoice_rl',
                deploymentId: 'customdeploy_rsm_invoice_rl'
              }, "Error during creation of a Journal Entry transaction!");
            }
          });
        }
      });
    }

    // Page init client script entry-point
    function pageInit(context) { }

    return {
      pageInit: pageInit,
      createCustomerDepositPdf: createCustomerDepositPdf,
      emailCustomerDepositPdf: emailCustomerDepositPdf,
      createInvoicePdf: createInvoicePdf,
      emailInvoicePdf: emailInvoicePdf,
      createPOJournalEntry1: createPOJournalEntry1,
      createPOJournalEntry2: createPOJournalEntry2,
      createKnjiznoZaduzenje: createKnjiznoZaduzenje
    };

  });