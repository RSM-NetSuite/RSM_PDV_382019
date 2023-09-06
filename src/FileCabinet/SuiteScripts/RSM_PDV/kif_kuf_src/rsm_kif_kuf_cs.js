/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N/ui/message', 'N/url', 'N/https'], function (message, url, https) {

  function pageInit(scriptContext) {
    var tables = document.getElementsByClassName('uir-outside-fields-table');
    for (var i = 1; i < tables.length; i++) {
      tables[i].setAttribute("style", "width: 65%;");
    }
    var resetButton = document.getElementById('resetlocalstorage');
    if (resetButton != null) { 
      resetButton.setAttribute("style", "background-color:red !important;color:white !important");
    }
  }

  /**
   * Refreshes the page
   */
  function refreshPage() {
    window.location.reload();
  }

  /**
   *  Return queryPairs object as key-value pairs from query string
   *  @returns {object} query string key-value pairs
   */
  function getQueryStringPairs() {
    var qs = window.location.search.substr(1);

    var queryPairs = {};
    var tempArray = qs.split("&");

    for (var i in tempArray) {
      var keyValuePair = tempArray[i].split("=");
      queryPairs[keyValuePair[0]] = keyValuePair[1];
    }

    return queryPairs;
  }

  /**
   * Gets data values from input and other form fields
   * @returns {object} object with form fields values
   */
  function getFormData() {
    var data = {
      from: document.getElementById('popdvdatefrom').value,
      to: document.getElementById('popdvdateto').value,
      kifKuf: document.getElementsByName('inpt_kifkufselect')[0].value.toLowerCase(),
      subsidiary: parseInt(document.getElementsByName('inpt_subsidiary')[0].value.split('/')[0])
    }
    data.valid = (data.from === '' || data.to === '' || data.kifKuf === '' || data.kifKuf === ' ') ? false : true;
    return data;
  }

  /**
   * Sends post request on restlet script
   * @param {object} data object that contains post data
   * @returns {object} response data
   */
  function callRestlet(data) {
    var restletUrl = url.resolveScript({
      scriptId: 'customscript_kif_kuf_rl',
      deploymentId: 'customdeploy_kif_kuf_rl'
    });

    // Generate request headers
    var headers = new Array();
    headers['Content-type'] = 'application/json';

    // https POST call
    var response = https.post({
      url: restletUrl,
      headers: headers,
      body: data
    });
    return JSON.parse(response.body);
  }

  /**
   * Calls restlet which then creates task which will run MapReduce script
   */
  function runMrScript() {
    var canRunScript = false;
    var formData = getFormData();

    if (formData.valid) {
      var taskId = (formData.kifKuf === 'kif') ? 'kifmrtaskid' : 'kufmrtaskid';
      var mrTaskId = localStorage.getItem(taskId);

      if (mrTaskId) {
        // Check status
        var response = callRestlet({
          "action": "checkstatus",
          "taskid": mrTaskId
        });

        if (response.status !== 'COMPLETE' && response.status !== 'FAILED') {
          message.create({
            type: message.Type.WARNING,
            title: 'Warning',
            message: "Map/Reduce script is already running!"
          }).show(5000);

        } else {
          canRunScript = true;
        }
      } else {
        canRunScript = true;
      }
    } else {
      message.create({
        type: message.Type.ERROR,
        title: 'Greska!',
        message: "Morate izabrati tip izvestaja i uneti POPDV datume!"
      }).show(5000);
    }


    if (canRunScript) {
      var response = callRestlet({
        "action": "runscript",
        "script": formData.kifKuf, // determines if it's kif or kuf
        'subsidiary': formData.subsidiary,
        'popdvdates': {
          from: formData.from,
          to: formData.to
        }
      });

      localStorage.setItem(taskId, response.mrtaskid);

      message.create({
        type: message.Type.CONFIRMATION,
        title: 'Success',
        message: "Map/Reduce script started! Task id: " + response.mrtaskid
      }).show(5000);
    }
  }

  /**
   * Calls restlet which checks current status of MapReduce script with provided task id
   */
  function checkTaskStatus() {
    var formData = getFormData();

    if (formData.kifKuf === '' || formData.kifKuf === ' ') {
      message.create({
        type: message.Type.WARNING,
        title: 'Warning',
        message: "Izaberite tip izvestaja za koji vrsite proveru!"
      }).show(5000);
      return;
    }

    var taskId = (formData.kifKuf === 'kif') ? 'kifmrtaskid' : 'kufmrtaskid';
    var mrTaskId = localStorage.getItem(taskId);

    if (mrTaskId) {
      var response = callRestlet({
        "action": "checkstatus",
        "taskid": mrTaskId
      });

      var stage = (response.status === 'COMPLETE' || response.status === 'PENDING') ? '' : (", Stage: " + response.stage)
      message.create({
        type: message.Type.INFORMATION,
        title: 'Information',
        message: "Map/Reduce script status: " + response.status + stage
      }).show(5000);

    } else {
      message.create({
        type: message.Type.INFORMATION,
        title: 'Information!',
        message: "Safe to run MR task for this report!"
      }).show(5000);
    }
  }

  /**
   * Changes url to exportXlsSuiteletUrl and calls a suitelet whichs downloads an xls file
   */
  function exportToExcel() {
    var queryPairs = getQueryStringPairs();

    var exportXlsSuiteletUrl = url.resolveScript({
      scriptId: 'customscript_rsm_kifkuf_export_xls_v2',
      deploymentId: 'customdeploy_rsm_kifkuf_export_xls_v2',
      params: {
        type: queryPairs.type,
        fileid: queryPairs.fileid,
        popdvdatefrom: queryPairs.popdvdatefrom,
        popdvdateto: queryPairs.popdvdateto,
        subsidiaryid: queryPairs.subsidiaryid
      }
    });

    window.location.href = exportXlsSuiteletUrl;
  }

  function resetLocalStorage() {
    var localStorage = window.localStorage;
    if (localStorage.getItem('kifmrtaskid') !== null) {
      localStorage.removeItem('kifmrtaskid');
    }
    if (localStorage.getItem('kufmrtaskid') !== null) {
      localStorage.removeItem('kufmrtaskid');
    }

    message.create({
      type: message.Type.CONFIRMATION,
      title: 'Success',
      message: "Reset successfully finished."
    }).show(5000);
  }

  return {
  pageInit: pageInit,
  runMrScript: runMrScript,
  checkTaskStatus: checkTaskStatus,
  refreshPage: refreshPage,
  exportToExcel: exportToExcel,
  resetLocalStorage: resetLocalStorage
};

});
