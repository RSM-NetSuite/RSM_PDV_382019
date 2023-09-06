/**
 * @NApiVersion 2.0
 * @NScriptType Suitelet
 * @NModuleScope Public 
 */
define(['N/xml', 'N/file', 'N/runtime', 'N/log', './popdvUtil', 'N/record'], function (xml, file, runtime, log, popdvUtil, record) {

  /**
  * Populates sadrzaj node of xml
  * @param {object} popdvScheme
  * @param {xml.Node} xmlDocument NetSuite xml.Node object from xml module which represents xml document
  * @param {xml.Node} sadrzaj NetSuite xml.Node object from xml module
  * @param {string} dateString Date of report creation
  * @param {object} params object with request parameters as properties
  */
  function populateContentElement(popdvScheme, xmlDocument, sadrzaj, dateString, params) {

    var subsidiaryRecord = record.load({
      type: record.Type.SUBSIDIARY,
      id: params.subsidiary,
      isDynamic: true
    });

    var subsidiaryMainAddress = subsidiaryRecord.getSubrecord('mainaddress');
    var address = subsidiaryMainAddress.getValue({
      fieldId: 'addr1'
    });
    var city = subsidiaryMainAddress.getValue({
      fieldId: 'city'
    });

    var country = subsidiaryMainAddress.getValue({
      fieldId: 'country'
    });
    var zip = subsidiaryMainAddress.getValue({
      fieldId: 'zip'
    });

    var companyName = subsidiaryRecord.getValue({
      fieldId: 'legalname'
    });
    var fullAddress = address + ', ' + city + ' ' + zip + ', ' + country;


    var nazivOpstine = params.organizationUnit;
    var oj = nazivOpstine.substr(0, nazivOpstine.indexOf("-") - 1);

    var OJ = xmlDocument.createElement('OJ');
    OJ.textContent = oj.toString();
    sadrzaj.appendChild(OJ);

    var pib = xmlDocument.createElement('PIB');
    pib.textContent = (params.pib).toString();
    sadrzaj.appendChild(pib);

    var firma = xmlDocument.createElement('Firma');
    firma.textContent = companyName;
    sadrzaj.appendChild(firma);

    var opstina = xmlDocument.createElement('Opstina');
    opstina.textContent = nazivOpstine;
    sadrzaj.appendChild(opstina);

    var adresa = xmlDocument.createElement('Adresa');
    //adresa.textContent = fullAddress;
    sadrzaj.appendChild(adresa);

    var odDatum = xmlDocument.createElement('Od_Datum');
    odDatum.textContent = params.xmlDateStart;
    sadrzaj.appendChild(odDatum);

    var doDatum = xmlDocument.createElement('Do_Datum');
    doDatum.textContent = params.xmlDateEnd;
    sadrzaj.appendChild(doDatum);

    var email = xmlDocument.createElement('ElektronskaPosta');
    var userEmail = runtime.getCurrentUser().email;
    email.textContent = userEmail;
    sadrzaj.appendChild(email);

    var mesto = xmlDocument.createElement('Mesto');
    sadrzaj.appendChild(mesto);

    var datumPrijave = xmlDocument.createElement('Datum_Prijave');
    datumPrijave.textContent = dateString;
    sadrzaj.appendChild(datumPrijave);

    var odgovornoLice = xmlDocument.createElement('OdgovornoLice');
    sadrzaj.appendChild(odgovornoLice);

    var iznos001 = xmlDocument.createElement("Iznos_001");
    iznos001.textContent = Math.round(popdvScheme["POPDV1"]['1.5'] + popdvScheme["POPDV1"]['1.6']).toString();
    sadrzaj.appendChild(iznos001);

    var iznos002 = xmlDocument.createElement("Iznos_002");
    iznos002.textContent = Math.round(popdvScheme["POPDV2"]['2.5'] + popdvScheme["POPDV2"]['2.6']).toString();
    sadrzaj.appendChild(iznos002);

    var iznos003 = xmlDocument.createElement("Iznos_003");
    iznos003.textContent = Math.round(popdvScheme["POPDV3"]['3.8']['3.8.1']).toString();
    sadrzaj.appendChild(iznos003);

    var iznos103 = xmlDocument.createElement("Iznos_103");
    iznos103.textContent = Math.round(popdvScheme["POPDV3"]['3.8']['3.8.2'] + popdvScheme["POPDV3"]['3.9']["3.9.2"] + popdvScheme["POPDV3a"]["3a.9"]["3a.9.1"]).toString();
    sadrzaj.appendChild(iznos103);

    var iznos004 = xmlDocument.createElement("Iznos_004");
    iznos004.textContent = Math.round(popdvScheme["POPDV3"]["3.8"]['3.8.3']).toString();
    sadrzaj.appendChild(iznos004);

    var iznos104 = xmlDocument.createElement("Iznos_104");
    iznos104.textContent = Math.round(popdvScheme["POPDV3"]["3.8"]['3.8.4'] + popdvScheme["POPDV3"]["3.9"]["3.9.4"] + popdvScheme["POPDV3a"]["3a.9"]["3a.9.2"]).toString();
    sadrzaj.appendChild(iznos104);

    var iznos005 = xmlDocument.createElement("Iznos_005");
    iznos005.textContent = Math.round(popdvScheme["POPDV5"]["5.6"]).toString();
    sadrzaj.appendChild(iznos005);

    var iznos105 = xmlDocument.createElement("Iznos_105");
    iznos105.textContent = Math.round(popdvScheme["POPDV5"]["5.7"]).toString();
    sadrzaj.appendChild(iznos105);

    var iznos006 = xmlDocument.createElement("Iznos_006");
    iznos006.textContent = Math.round(popdvScheme["POPDV6"]["6.3"]).toString();
    sadrzaj.appendChild(iznos006);

    var iznos106 = xmlDocument.createElement("Iznos_106");
    iznos106.textContent = Math.round(popdvScheme["POPDV6"]["6.4"]).toString();
    sadrzaj.appendChild(iznos106);

    var iznos007 = xmlDocument.createElement("Iznos_007");
    iznos007.textContent = "0"; // 7.3? 7.3.2
    sadrzaj.appendChild(iznos007);

    var iznos107 = xmlDocument.createElement("Iznos_107");
    iznos107.textContent = "0"; // 7.4? 7.4.2
    sadrzaj.appendChild(iznos107);

    var iznos008 = xmlDocument.createElement("Iznos_008");
    iznos008.textContent = Math.round(popdvScheme["POPDV8"]["8dj"]).toString();
    sadrzaj.appendChild(iznos008);

    var iznos108 = xmlDocument.createElement("Iznos_108");
    iznos108.textContent = Math.round(popdvScheme["POPDV8"]["8e.6"]).toString();
    sadrzaj.appendChild(iznos108);

    var iznos009 = xmlDocument.createElement("Iznos_009");
    iznos009.textContent = Math.round(popdvScheme["POPDV9"]).toString();
    sadrzaj.appendChild(iznos009);

    var iznos109 = xmlDocument.createElement("Iznos_109");
    iznos109.textContent = Math.round(popdvScheme["POPDV9a"]["9a.4"]).toString();
    sadrzaj.appendChild(iznos109);

    var iznos110 = xmlDocument.createElement("Iznos_110");
    iznos110.textContent = Math.round(popdvScheme["POPDV10"]).toString();
    sadrzaj.appendChild(iznos110);

    if (Math.round(popdvScheme["POPDV10"]) < 0) {
      var povracaj = (params.isReturn).toString();
      switch (povracaj) {
        case "0":
          var povracajDa = xmlDocument.createElement('PovracajDA');
          povracajDa.textContent = "0";
          sadrzaj.appendChild(povracajDa);

          var povracajNe = xmlDocument.createElement('PovracajNE');
          povracajNe.textContent = "1";
          sadrzaj.appendChild(povracajNe);
          break;

        case "1":
          var povracajDa = xmlDocument.createElement('PovracajDA');
          povracajDa.textContent = "1";
          sadrzaj.appendChild(povracajDa);

          var povracajNe = xmlDocument.createElement('PovracajNE');
          povracajNe.textContent = "0";
          sadrzaj.appendChild(povracajNe);
          break;
      }
    }

    var periodPob = xmlDocument.createElement('PeriodPOB');
    periodPob.textContent = (params.taxPeriodMark).toString();
    sadrzaj.appendChild(periodPob);

    var tipPodnosioca = xmlDocument.createElement('TipPodnosioca');
    tipPodnosioca.textContent = (params.submitterType).toString();
    sadrzaj.appendChild(tipPodnosioca);

    var izmenaPrijave = params.isFormChange;
    var izmenaPrijaveEl = xmlDocument.createElement('IzmenaPrijave');
    izmenaPrijaveEl.textContent = izmenaPrijave.toString();
    sadrzaj.appendChild(izmenaPrijaveEl);

    var identifikacioniBrojPrijaveKojaSeMenjaEl = xmlDocument.createElement('IdentifikacioniBrojPrijaveKojaSeMenja');
    if (izmenaPrijave == 1) {
      identifikacioniBrojPrijaveKojaSeMenjaEl.textContent = (params.formIdNumber).toString();
    } else {
      identifikacioniBrojPrijaveKojaSeMenjaEl.textContent = "-1";
    }
    sadrzaj.appendChild(identifikacioniBrojPrijaveKojaSeMenjaEl);
  }

  /**
   * Create XML string using popdvScheme
   * @param {object} popdvScheme
   * @param {object} params object with request parameters as properties
   */
  function createXMLString(popdvScheme, params) {
    var newDate = new Date();
    var isoDate = newDate.toISOString().split('.')[0];
    var dateString = newDate.toISOString().split("T")[0];

    var xmlStr = "<?xml version='1.0' encoding='UTF-8' standalone='yes'?>" +
      "<ns1:EPPPDV vremePodnosenja='" + isoDate + "' xmlns:ns1='urn:poreskauprava.gov.rs/zim' xmlns:xs='http://www.w3.org/2001/XMLSchema'>" +
      "<envelopa id='' nacinPodnosenja='elektronski' timestamp='" + isoDate + "'>" +
      "<datumEvidentiranja></datumEvidentiranja>" +
      "</envelopa>" +
      "</ns1:EPPPDV>";

    var xmlDocument = xml.Parser.fromString({
      text: xmlStr
    });

    var datumEvidentiranja = xml.XPath.select({
      node: xmlDocument,
      xpath: '//datumEvidentiranja'
    })[0];

    datumEvidentiranja.textContent = dateString;

    var envelopa = xml.XPath.select({
      node: xmlDocument,
      xpath: '//envelopa'
    })[0];

    var sadrzaj = xmlDocument.createElement('sadrzaj');
    populateContentElement(popdvScheme, xmlDocument, sadrzaj, dateString, params);
    envelopa.appendChild(sadrzaj);

    var obracuni = xmlDocument.createElement('obracuni');
    envelopa.appendChild(obracuni);

    for (var popdvEl in popdvScheme) {
      var popdvXmlElement = xmlDocument.createElement(popdvEl);
      if (typeof popdvScheme[popdvEl] === "object" && popdvScheme[popdvEl] !== null) {
        for (var field in popdvScheme[popdvEl]) {
          if (typeof popdvScheme[popdvEl][field] === "object" && popdvScheme[popdvEl][field] !== null) {
            for (var finalField in popdvScheme[popdvEl][field]) {
              if (popdvScheme[popdvEl][field][finalField] !== 0) {
                var fieldLabel = finalField.replace(/\./g, "");
                var xmlChildElement = xmlDocument.createElement("Iznos_" + fieldLabel);
                xmlChildElement.textContent = Math.round(popdvScheme[popdvEl][field][finalField]).toString();
                popdvXmlElement.appendChild(xmlChildElement);
              }
            }
          } else {
            if (popdvScheme[popdvEl][field] !== 0) {
              var fieldLabel = field.replace(/\./g, "");
              var xmlChildElement = xmlDocument.createElement("Iznos_" + fieldLabel);
              xmlChildElement.textContent = Math.round(popdvScheme[popdvEl][field]).toString();
              popdvXmlElement.appendChild(xmlChildElement);
            }
          }
        }
      } else {
        if (popdvScheme[popdvEl] !== 0) {
          var fieldLabel = popdvEl.replace(/POPDV/g, "");
          var xmlChildElement = xmlDocument.createElement("Iznos_" + fieldLabel);
          xmlChildElement.textContent = Math.round(popdvScheme[popdvEl]).toString();
          popdvXmlElement.appendChild(xmlChildElement);
        }
      }
      obracuni.appendChild(popdvXmlElement);
    }

    var xmlString = xml.Parser.toString(xmlDocument);
    return xmlString;
  }

  // Suitelet entry-point function
  function onRequest(context) {
    var params = {
      dateStart: context.request.parameters.datestart,
      dateEnd: context.request.parameters.dateend,
      xmlDateStart: context.request.parameters.xmldatestart,
      xmlDateEnd: context.request.parameters.xmldateend,
      pib: context.request.parameters.pib,
      subsidiary: context.request.parameters.subsidiary,
      organizationUnit: context.request.parameters.organizacionajedinica,
      isReturn: context.request.parameters.povracaj,
      taxPeriodMark: context.request.parameters.oznakaporeskogperioda,
      submitterType: context.request.parameters.tippodnosioca,
      isFormChange: context.request.parameters.izmenaprijave,
      formIdNumber: context.request.parameters.identifikacionibrojprijave
    };

    // Get and map popdv scheme
    var popdvScheme = popdvUtil.getPopdvScheme();
    popdvUtil.populatePopdvScheme(popdvScheme, params.dateStart, params.dateEnd, params.subsidiary);

    var xmlStr = createXMLString(popdvScheme, params);

    var xmlFile = file.create({
      name: 'popdv.xml',
      fileType: file.Type.XMLDOC,
      contents: xmlStr
    });

    context.response.writeFile(xmlFile);

    // var obj = {};
    // popdvData.each(function (result) {
    //   // var taxCodeId = result.getValue({name:'taxcode', summary:search.Summary.GROUP});
    //   // var taxCode = record.load({id:taxCodeId, type:search.Type.SALES_TAX_ITEM}).getValue("itemid");
    //   var taxCode = record.getText({name:'taxcode', summary:search.Summary.GROUP});
    //   var grossAmountTotal = parseFloat(result.getValue({ name: 'grossamount', summary: search.Summary.SUM }));
    //   var taxAmountTotal = -1 * parseFloat(result.getValue({ name: 'taxamount', summary: search.Summary.SUM }));
    //   var type = result.getValue({ name: 'recordtype', summary: search.Summary.GROUP });
    //   obj[taxCode] = {
    //     grossAmountTotal: grossAmountTotal,
    //     netAmountTotal: grossAmountTotal - taxAmountTotal,
    //     taxAmountTotal: taxAmountTotal,
    //     type: type
    //   }
    //   return true;
    // });

    // context.response.write({
    //   // output: createXMLString()
    //   // output: JSON.stringify(popdvScheme)
    //   output: JSON.stringify(obj)
    // });
  }

  return {
    onRequest: onRequest
  };

});