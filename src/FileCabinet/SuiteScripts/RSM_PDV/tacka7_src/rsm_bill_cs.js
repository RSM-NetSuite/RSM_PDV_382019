/**
 * @NApiVersion 2.0
 * @NScriptType ClientScript
 * @NModuleScope SameAccount 
 */
define(['N/ui/message', 'N/url', 'N/https', 'N/format', 'N/log', './customDialog.js'],
  function (message, url, https, format, log, customDialog) {

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

    /**
     * Disables or enables button depending on the value isCreated which tells if JE tran. has been created or not
     * @param {boolean} disable tells if element should be disabled or not
     */
    function _disableButton(btnElId, disable) {
      document.getElementById(btnElId).disabled = (disable) ? 'disabled' : '';
    };

    /**
     * Helper function to call certain resltet with passed data parameter
     * @param {object} data 
     * @param {string} errorMessageTitle
     */
    function _callRestlet(data, errorMessageTitle, btnElId) {
      // Call restlet here
      var restletUrl = url.resolveScript({
        scriptId: 'customscript_rsm_bill_rl',
        deploymentId: 'customdeploy_rsm_bill_rl'
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
            _disableButton(btnElId, false);
          }
        }
      }).catch(function (err) {
        log.error(errorMessageTitle, "Error message: " + err);
        _disableButton(btnElId, false);
      });
    }

    /**
     * Button click event function
     * Calls resltet which generates new Journal Entry transaction record
     * @param {object} params 
     * @param {number} params.billId internal id of a bill record
     * @param {number} params.je flag which determines which JE should be created
     * @param {string} params.btnId DOM element id of a button
     */
    function createJE(params) {
      if (params.je === 1) {
        message.create({
          type: msgTypes['information'],
          title: 'Info',
          message: "Akcija pokrenuta. Generisanje Journal transakcije je u toku...",
          duration: 5000
        }).show();

        _disableButton(params.btnId, true);

        _callRestlet({
          action: 'createJournal',
          billId: params.billId,
          je: params.je
        }, "Couldn't create Journal Entry!", params.btnId);

      } else if (params.je === 2) {
        // Open custom dialog to get date input then call restlet
        cDialog.display({
          title: "Unos datuma za neplacenu carinu",
          inputType: 'date',
          inputLabel: "Unesite datum:",
          confirmBtnText: 'Ok',
          cancelBtnText: 'Odustani',
          callback: function (dialogValue) {
            message.create({
              type: msgTypes['information'],
              title: 'Info',
              message: "Akcija pokrenuta. Generisanje Journal transakcije je u toku...",
              duration: 5000
            }).show();
            
            _disableButton(params.btnId, true);

            _callRestlet({
              action: 'createJournal',
              billId: params.billId,
              je: params.je,
              date: dialogValue
            }, "Couldn't create Journal Entry!", params.btnId);
          }
        });
      }
    }

    function pageInit(context) { }

    return {
      pageInit: pageInit,
      createJE: createJE
    };

  });