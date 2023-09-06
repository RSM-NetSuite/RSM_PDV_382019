/**
 * customDialog.js
 * @NApiVersion 2.x
 * @NModuleScope Public
 * 
 * Custom dialog module which takes input from a user and calls callback function on confirm
 * 
 * Can only be loaded in Client Script type!
 *
 */

define([], function () {

  /**
   * Validates input field value and returns the result
   * @returns {object} check (boolean value which tells if input value is correct), value
   */
  function _validateInputValue() {
    var inputEl = document.getElementById('dialog-input');
    var value = inputEl.value;
    if (!value || value === '' || value === ' ') {
      alert('Invalid value!');
      return {
        check: false,
        value: value
      };
    }
    return {
      check: true,
      value: value
    };
  }

  /**
   * Sets dialog's and dimmer's display style to none
   */
  function _close() {
    document.documentElement.style.overflow = 'scroll';
    // document.getElementById('custom-dialog').style.display = 'none';
    // document.getElementById('dialog-dimmer').style.display = 'none';
    document.getElementById('custom-dialog').remove();
    document.getElementById('dialog-dimmer').remove();
  }

  /**
   * Gets value from dialog input field and sets it in the localStorage
   */
  function _getInputValue(callback) {
    var result = _validateInputValue();
    if (result.check) {
      _close();
      callback(result.value);
    }
  }

  /**
   * Builds modal and dimmer elements
   * @param {object} options 
   * @param {string} options.title
   * @param {string} options.inputType
   * @param {string} options.confirmBtnText
   * @param {string} options.cancelBtnText
   * @param {function} options.callback
   */
  function _buildBody(options) {
    document.body.innerHTML +=
      "<div id=\"dialog-dimmer\" style=\"position:absolute;" +
      " top:0; left:0; display: none; width: 100%; height: 100%;" +
      " z-index=100; background-color: rgba(0, 0, 0, 0.6);\"></div>";

    document.body.innerHTML +=
      "<div id=\"custom-dialog\" style=\"position:absolute; display:none; top:50%;" +
      "transform:translate(-50%, -50%); background-color: #fff;" +
      " left:50%; width: 400px; height: 200px; z-index=110;\">" +
      "<div style=\"width: 100%; height: 15%; background-color: #607799; padding:5px 0;" +
      " color: #ffffff; text-align:center;\">" + options.title + "</div>" +
      "<div style=\"position:absolute; top:40%; left:50%; transform:translate(-50%, -50%); text-align: center;\">" +
      "<p>" + options.inputLabel + "</p>" +
      "<input id=\"dialog-input\" type=\"" + options.inputType + "\"></div>" +
      "<button id=\"confirm-button\" style=\"position: absolute; bottom: 10%; left: 25%;\" >" + options.confirmBtnText + "</button>" +
      "<button id=\"cancel-button\" style=\"position: absolute; bottom: 10%; right: 25%;\" >" + options.cancelBtnText + "</button>" +
      "</div>";

    document.getElementById('confirm-button').onclick = function () {
      _getInputValue(options.callback);
    };
    document.getElementById('cancel-button').onclick = _close;
  }

  /**
  * Builds the dialog body and sets to display block;
  * @param {object} options 
  * @param {string} options.title
  * @param {string} options.inputType
  * @param {string} options.confirmBtnText
  * @param {string} options.cancelBtnText
  * @param {function} options.callback
  */
  function display(options) {
    // var dialog = document.getElementById('custom-dialog');
    // if (!dialog) {
    //   _buildBody(options);
    // }
    _buildBody(options);
    document.documentElement.style.overflow = 'hidden';
    document.getElementById('custom-dialog').style.display = 'block';
    document.getElementById('dialog-dimmer').style.display = 'block';
  }

  var customDialog = {
    display: display
  };

  return {
    customDialog: customDialog
  }
});