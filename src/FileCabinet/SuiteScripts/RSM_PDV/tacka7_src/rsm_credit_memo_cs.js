/**
 * @NApiVersion 2.0
 * @NScriptType ClientScript
 * @NModuleScope SameAccount 
 */
define(['N/currentRecord', 'N/ui/message', 'N/url', 'N/record', 'N/https', 'N/format', 'N/log', './customDialog.js'],
  function (currentRecord, message, url, record, https, format, log, customDialog) {

    var cDialog = customDialog.customDialog;
    var msgTypes = {
      'confirmation': message.Type.CONFIRMATION,
      'information': message.Type.INFORMATION,
      'warning': message.Type.WARNING,
      'error': message.Type.ERROR
    };

    /**
     * Formats date object with provided timezone and returns a string
     * @param {date} date NetSuite date object 
     */
    function formatDate(date) {
      return format.format({
        value: date,
        type: format.Type.DATETIME,
        timezone: format.Timezone.EUROPE_BUDAPEST
      }); 
    }

    function pageInit(context) {
      console.log('This should work in edit mode!');
    }

    /**
     * Disables or enables button depending on the value isCreated which tells if JE tran. has been created or not
     * @param {boolean} disable tells if element should be disabled or not
     */
    function _disableButton(disable) {
      document.getElementById('custpage_umanjenje_pdv').disabled = (disable) ? 'disabled' : '';
    };

    /**
     * Helper function to call certain resltet with passed data parameter
     * @param {object} data 
     * @param {string} errorMessageTitle
     */
    function _callRestlet(data, errorMessageTitle) {
      // Call restlet here
      var restletUrl = url.resolveScript({
        scriptId: 'customscript_rsm_credit_memo_rl',
        deploymentId: 'customdeploy_rsm_credit_memo_rl'
      });

      // Generate request headers
      var headers = new Array();
      headers['Content-type'] = 'application/json';

      // https POST call - returns promise object
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

        if (data.action === 'createJournal') {
          if (res.isCreated) {
            setTimeout(function () {
              window.location.reload();
            }, 5000);
          } else {
            _disableButton(false);
          }
        }
      }).catch(function (err) {
        log.error(errorMessageTitle, "Error message: " + err);
      });
    }

    /**
     * Opens custom input dialogs for getting date and number values then calls a restlet to generate JE transaction
     * @param {object} params 
     */
    function createJournal(params) {
      // Custom dialog 1
      cDialog.display({
        title: "Unos datuma za saglasnost umanjenja PDV-a",
        inputType: 'date',
        inputLabel: "Unesite datum:",
        confirmBtnText: 'Ok',
        cancelBtnText: 'Odustani',
        callback: function (dialogValue1) {
          // Custom dialog 2
          cDialog.display({
            title: "Unos broja potvrde za oslobodjenje PDV-a",
            inputType: 'text',
            inputLabel: "Unesite broj:",
            confirmBtnText: 'Ok',
            cancelBtnText: 'Odustani',
            callback: function (dialogValue2) {
              message.create({
                type: msgTypes['information'],
                title: 'Information',
                message: "Postupak umanjenja PDV-a pokrenut. Generisanje Journal transakcije je u toku...",
                duration: 5000
              }).show();
              _disableButton(true);

              var data = {
                action: 'createJournal',
                data: {
                  subsidiary: params.subsidiary,
                  account: params.account,
                  taxCode: params.taxCode,
                  taxAccountId: params.taxAccountId,
                  amount: params.amount,
                  netAmount: params.netAmount,
                  taxAmount: params.taxAmount,
                  creditMemoId: params.creditMemoId,
                  date: dialogValue1,
                  number: dialogValue2
                }
              };

              // Call restlet here
              _callRestlet(data, "Error during journal tran. generating");
            }
          });
        }
      });
    }

    /**
     * Calls resltet with params to create credit memo pdf invoice
     */
    function createCreditMemoPdf(params) {
      message.create({
        type: msgTypes['information'],
        title: "Akcija",
        message: "Kreiranje PDF fakture je u toku...",
        duration: 5000
      }).show();

      // Get current record field values as params
      var currRec = currentRecord.get();
      var loadedRecord = record.load({
        type: currRec.type,
        id: currRec.id
      });

      var data = {
        action: 'createpdf',
        data: {
          creditMemoId: params.creditMemoId,
          account: params.account,
          tranId: loadedRecord.getValue('tranid'),
          tranDate: formatDate(loadedRecord.getValue('trandate')),
          amount: parseFloat(params.amount.toFixed(2)),
          netAmount: parseFloat(params.netAmount.toFixed(2)),
          taxAmount: parseFloat(params.taxAmount.toFixed(2)),
          rate: params.rate,
          memo: loadedRecord.getValue('memo'),
          location: loadedRecord.getText('location'),
          customerId: loadedRecord.getValue('entity')
        }
      };

      // Call restlet here
      _callRestlet(data, "Error during Credit Memo PDF invoice creation");
    }

    /**
     * Calls restlet with parameters to email credit memo pdf invoice
     */
    function emailCreditMemoPdf() {
      if (confirm("Da li ste sigurni da zelite da posaljete PDF fakturu?")) {
        message.create({
          type: msgTypes['information'],
          title: "Akcija",
          message: "Slanje PDF fakture preko Email-a je u toku...",
          duration: 5000
        }).show();

        // Get current record field values as params
        var currRec = currentRecord.get();
        var loadedRecord = record.load({
          type: currRec.type,
          id: currRec.id
        });

        // Call restlet with approprate params
        data = {
          action: 'emailpdf',
          data: {
            creditMemoId: currRec.id,
            location: loadedRecord.getText('location')
          }
        };

        // Call restlet here
        _callRestlet(data, "Error during customer deposit PDF invoice creation");
      }

    }

    return {
      pageInit: pageInit,
      createJournal: createJournal,
      createCreditMemoPdf: createCreditMemoPdf,
      emailCreditMemoPdf: emailCreditMemoPdf
    };

  });