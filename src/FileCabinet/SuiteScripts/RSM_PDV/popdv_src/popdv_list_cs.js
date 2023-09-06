/**
 * @NApiVersion 2.x
 * @NScriptType ClientScript
 */

define(["N/url"], function (url) {

  // Client script entry-point function
  function pageInit(context) { }
  var queryString = {};

  /**
   * Extract query strings from url and return it as key-value pairs in object
   * @returns {object} Query string key-value pairs 
   */
  function getQueryString() {
    var match,
      pl = /\+/g, // Regex for replacing addition symbol with a space
      search = /([^&=]+)=?([^&]*)/g,
      decode = function (s) {
        return decodeURIComponent(s.replace(pl, ' '));
      },
      query = window.location.search.substring(1);

    urlParams = {};
    while ((match = search.exec(query)))
      urlParams[decode(match[1])] = decode(match[2]);

    return urlParams;
  }

  /**
   * Resolve export pdf suitelet url and go to it
   */
  function exportPdf() {
    queryString = getQueryString();
    var suiteletUrl = url.resolveScript({
      scriptId: "customscript_popdv_pdf_export_su_v2",
      deploymentId: "customdeploy_popdv_pdf_export_su_v2",
      params: {
        datestart: queryString.datestart,
        pdfdatestart: queryString.pdfdatestart,
        dateend: queryString.dateend,
        pdfdateend: queryString.pdfdateend,
        organizacionajedinica: queryString.organizacionajedinica,
        pib: queryString.pib,
        tippodnosioca: queryString.tippodnosioca,
        oznakaporeskogperioda: queryString.oznakaporeskogperioda,
        izmenaprijave: queryString.izmenaprijave,
        identifikacionibrojprijave: queryString.identifikacionibrojprijave,
        subsidiary: queryString.subsidiary
      }
    });
    window.open(suiteletUrl, '_blank');
  }

  /**
   * Resolve export xml suitelet url and go to it
   */
  function exportXml() {
    queryString = getQueryString();
    var suiteletUrl = url.resolveScript({
      scriptId: "customscript_popdv_xml_export_su_v2",
      deploymentId: "customdeploy_popdv_xml_export_su_v2",
      params: {
        datestart: queryString.datestart,
        xmldatestart: queryString.xmldatestart,
        dateend: queryString.dateend,
        xmldateend: queryString.xmldateend,
        organizacionajedinica: queryString.organizacionajedinica,
        pib: queryString.pib,
        tippodnosioca: queryString.tippodnosioca,
        oznakaporeskogperioda: queryString.oznakaporeskogperioda,
        izmenaprijave: queryString.izmenaprijave,
        povracaj: queryString.povracaj,
        identifikacionibrojprijave: queryString.identifikacionibrojprijave,
        subsidiary: queryString.subsidiary
      }
    });
    window.open(suiteletUrl, '_blank');
  }

  function exportXls() {
    queryString = getQueryString();
    var suiteletUrl = url.resolveScript({
      scriptId: "customscript_popdv_xls_export_su",
      deploymentId: "customdeploy_popdv_xls_export_su",
      params: {
        datestart: queryString.datestart,
        xmldatestart: queryString.xmldatestart,
        dateend: queryString.dateend,
        xmldateend: queryString.xmldateend,
        organizacionajedinica: queryString.organizacionajedinica,
        pib: queryString.pib,
        tippodnosioca: queryString.tippodnosioca,
        oznakaporeskogperioda: queryString.oznakaporeskogperioda,
        izmenaprijave: queryString.izmenaprijave,
        povracaj: queryString.povracaj,
        identifikacionibrojprijave: queryString.identifikacionibrojprijave,
        subsidiary: queryString.subsidiary
      }
    });
    window.open(suiteletUrl, '_blank');
  }

  function exportValidationXls() {
    queryString = getQueryString();
    var suiteletUrl = url.resolveScript({
      scriptId: "customscript_popdv_validation_xls_export",
      deploymentId: "customdeploy_popdv_validation_xls_export",
      params: {
        datestart: queryString.datestart,
        xmldatestart: queryString.xmldatestart,
        dateend: queryString.dateend,
        xmldateend: queryString.xmldateend,
        organizacionajedinica: queryString.organizacionajedinica,
        pib: queryString.pib,
        tippodnosioca: queryString.tippodnosioca,
        oznakaporeskogperioda: queryString.oznakaporeskogperioda,
        izmenaprijave: queryString.izmenaprijave,
        povracaj: queryString.povracaj,
        identifikacionibrojprijave: queryString.identifikacionibrojprijave,
        subsidiary: queryString.subsidiary
      }
    });
    window.open(suiteletUrl, '_blank');
  }



  return {
    pageInit: pageInit,
    exportPdf: exportPdf,
    exportXml: exportXml,
    exportXls: exportXls,
    exportValidation: exportValidationXls
  };

});
