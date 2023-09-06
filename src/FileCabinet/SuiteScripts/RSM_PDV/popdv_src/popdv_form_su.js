/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 */

define(["N/ui/serverWidget", "N/http", "N/log", './dateUtil', 'N/search'], function (serverWidget, http, log, dateUtil, search) {

  var dUtil = dateUtil.dateUtil;

  /**
   * Resolves first day and last day dates of the current month
   * @returns {object} Object with two properties - startDate & endDate
   */
  function resolveDates() {
    var date = new Date();
    var firstDay = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    var lastDay = new Date(date.getFullYear(), date.getMonth(), 0);

    return {
      startDate: dUtil.createNewDateString(firstDay.getDate(), firstDay.getMonth() + 1, firstDay.getFullYear()),
      endDate: dUtil.createNewDateString(lastDay.getDate(), lastDay.getMonth() + 1, lastDay.getFullYear())
    };
  }

  /**
   * Creates and runs a subsidiary saved search
   * @returns {object} returns custom object with keys as internalid's of subsidiaries and values as object with subsidiary props
   */
  function getSubsidiaries() {
    var results = search.create({
      type: 'subsidiary',
      filters: [],
      columns: [
        'internalid',
        'name',
        'country'
      ]
    }).run();

    var obj = {};
    results.each(function (result) {
      obj[result.getValue('internalid')] = {
        internalid: result.getValue('internalid'),
        name: result.getValue('name'),
        country: result.getValue('country')
      }
      return true;
    });

    return obj;
  }

  /**
   * Creates a date string 
   * @param {string} date date string suitable for report
   * @returns {string}
   */
  function createPdfDate(date) {
    return dUtil.getDay(date) +
      "." +
      dUtil.getMonth(date) +
      "." +
      dUtil.getYear(date);
  }

  /**
   * Creates a date string 
   * @param {string} date date string format needed for xml file
   * @returns {string}
   */
  function createXmlDate(date) {
    var month = dUtil.getMonth(date);
    var day = dUtil.getDay(date);
    return dUtil.getYear(date) + "-" +
      ((month < 10) ? "0" + month : month) + "-" +
      ((day < 10) ? "0" + day : day);
  }

  // Suitelet entry-point function
  function onRequest(context) {
    if (context.request.method === "GET") {
      var sifarnikOpstina = [
        "201 - Ada",
        "001 - Aleksandrovac",
        "002 - Aleksinac",
        "202 - Alibunar",
        "203 - Apatin",
        "003 - Aranđelovac",
        "004 - Arilje",
        "006 - Babušnica",
        "007 - Bajina Bašta",
        "010 - Barajevo",
        "008 - Batočina",
        "204 - Bač",
        "205 - Bačka Palanka",
        "206 - Bačka Topola",
        "207 - Bački Petrovac",
        "009 - Bela Palanka",
        "209 - Bela Crkva",
        "210 - Beočin",
        "208 - Bečej",
        "023 - Blace",
        "024 - Bogatić",
        "025 - Bojnik",
        "026 - Boljevac",
        "027 - Bor",
        "028 - Bosilegrad",
        "029 - Brus",
        "030 - Bujanovac",
        "107 - Valjevo",
        "108 - Varvarin",
        "109 - Velika Plana",
        "110 - Veliko Gradište",
        "321 - Vitina",
        "112 - Vladimirci",
        "111 - Vladičin Han",
        "113 - Vlasotince",
        "019 - Voždovac",
        "114 - Vranje",
        "020 - Vračar",
        "240 - Vrbas",
        "115 - Vrnjačka Banja",
        "241 - Vršac",
        "322 - Vučitrn",
        "039 - Gadžin Han",
        "304 - Glogovac",
        "305 - Gnjilane",
        "040 - Golubac",
        "331 - Gora",
        "041 - Gornji Milanovac",
        "012 - Grocka",
        "036 - Despotovac",
        "301 - Dečani",
        "037 - Dimitrovgrad",
        "038 - Doljevac",
        "303 - Đakovica",
        "243 - Žabalj",
        "117 - Žabari",
        "118 - Žagubica",
        "244 - Žitište",
        "119 - Žitorađa",
        "116 - Zaječar",
        "022 - Zvezdara",
        "330 - Zvečan",
        "021 - Zemun",
        "242 - Zrenjanin",
        "324 - Zubin Potok",
        "042 - Ivanjica",
        "212 - Inđija",
        "213 - Irig",
        "306 - Istok",
        "096 - Jagodina",
        "214 - Kanjiža",
        "307 - Kačanik",
        "215 - Kikinda",
        "043 - Kladovo",
        "308 - Klina",
        "044 - Knić",
        "045 - Knjaževac",
        "216 - Kovačica",
        "217 - Kovin",
        "048 - Kosjerić",
        "328 - Kosovo Polje",
        "309 - Kosovska Kamenica",
        "310 - Kosovska Mitrovica",
        "046 - Koceljeva",
        "049 - Kragujevac",
        "050 - Kraljevo",
        "051 - Krupanj",
        "052 - Kruševac",
        "218 - Kula",
        "054 - Kuršumlija",
        "053 - Kučevo",
        "056 - Lazarevac",
        "055 - Lajkovac",
        "121 - Lapovo",
        "057 - Lebane",
        "311 - Leposavić",
        "058 - Leskovac",
        "312 - Lipljan",
        "059 - Loznica",
        "060 - Lučani",
        "061 - Ljig",
        "062 - Ljubovija",
        "063 - Majdanpek",
        "065 - Mali Zvornik",
        "219 - Mali Iđoš",
        "066 - Malo Crniće",
        "067 - Medveđa",
        "128 - Mediana",
        "068 - Merošina",
        "069 - Mionica",
        "070 - Mladenovac",
        "072 - Negotin",
        "122 - Niška Banja",
        "074 - Nova Varoš",
        "220 - Nova Crnja",
        "013 - Novi Beograd",
        "221 - Novi Bečej",
        "222 - Novi Kneževac",
        "075 - Novi Pazar",
        "223 - Novi Sad",
        "329 - Novo Brdo",
        "327 - Obilić",
        "014 - Obrenovac",
        "225 - Opovo",
        "313 - Orahovac",
        "076 - Osečina",
        "224 - Odžaci",
        "015 - Palilula",
        "127 - Palilula (Niš)",
        "125 - Pantelej",
        "226 - Pančevo",
        "077 - Paraćin",
        "247 - Petrovaradin",
        "078 - Petrovac na Mlavi",
        "314 - Peć",
        "227 - Pećinci",
        "079 - Pirot",
        "228 - Plandište",
        "315 - Podujevo",
        "080 - Požarevac",
        "081 - Požega",
        "082 - Preševo",
        "083 - Priboj na Limu",
        "317 - Prizren",
        "084 - Prijepolje",
        "316 - Priština",
        "085 - Prokuplje",
        "088 - Ražanj",
        "120 - Rakovica",
        "086 - Rača",
        "087 - Raška",
        "089 - Rekovac",
        "229 - Ruma",
        "016 - Savski venac",
        "097 - Svilajnac",
        "098 - Svrljig",
        "231 - Senta",
        "230 - Sečanj",
        "091 - Sjenica",
        "092 - Smederevo",
        "093 - Smederevska Palanka",
        "094 - Sokobanja",
        "232 - Sombor",
        "017 - Sopot",
        "318 - Srbica",
        "233 - Srbobran",
        "234 - Sremska Mitrovica",
        "250 - Sremski Karlovci",
        "235 - Stara Pazova",
        "018 - Stari grad",
        "123 - Stragari",
        "236 - Subotica",
        "319 - Suva Reka",
        "095 - Surdulica",
        "124 - Surčin",
        "238 - Temerin",
        "239 - Titel",
        "101 - Topola",
        "102 - Trgovište",
        "103 - Trstenik",
        "104 - Tutin",
        "032 - Ćićevac",
        "033 - Ćuprija",
        "105 - Ub",
        "100 - Užice",
        "320 - Uroševac",
        "126 - Crveni krst",
        "031 - Crna Trava",
        "035 - Čajetina",
        "034 - Čačak",
        "211 - Čoka",
        "011 - Čukarica",
        "099 - Šabac",
        "237 - Šid",
        "325 - Štimlje",
        "326 - Štrpce"
      ];

      var form = serverWidget.createForm({
        title: "POPDV Form"
      });
      form.clientScriptModulePath = "./popdv_form_cs.js";
      var zaPeriodOd = form.addField({
        id: "custpage_za_period_od",
        type: serverWidget.FieldType.DATE,
        label: "Za period od"
      });
      zaPeriodOd.layoutType = serverWidget.FieldLayoutType.NORMAL;
      zaPeriodOd.updateBreakType({
        breakType: serverWidget.FieldBreakType.STARTCOL
      });

      var zaPeriodDo = form.addField({
        id: "custpage_za_period_do",
        type: serverWidget.FieldType.DATE,
        label: "Za period do"
      });
      var dates = resolveDates();
      zaPeriodOd.defaultValue = dates["startDate"];
      zaPeriodDo.defaultValue = dates["endDate"];

      var organizationaJedinica = form.addField({
        id: "custpage_organizaciona_jedinica",
        type: serverWidget.FieldType.SELECT,
        label: "Organizaciona jedinica"
      });
      sifarnikOpstina.forEach(function (item) {
        organizationaJedinica.addSelectOption({
          value: item,
          text: item.slice(6)
        });
      });

      var pib = form.addField({
        id: "custpage_pib",
        type: serverWidget.FieldType.TEXT,
        label: "PIB"
      });

      var subsidiaryField = form.addField({
        id: 'custpage_subsidiary',
        label: 'Subsidiary:',
        type: serverWidget.FieldType.SELECT
      });
      var subsidiaries = getSubsidiaries();
      for(var i in subsidiaries) {
        subsidiaryField.addSelectOption({
          value: subsidiaries[i].internalid,
          text: subsidiaries[i].internalid + '/' + subsidiaries[i].name
        });
      }

      var tipPodnosioca = form.addField({
        id: "custpage_tip_podnosioca",
        type: serverWidget.FieldType.SELECT,
        label: "Tip podnosioca"
      });
      tipPodnosioca.addSelectOption({
        value: 1,
        text: "Poreski obveznik"
      });
      tipPodnosioca.addSelectOption({
        value: 2,
        text: "Poreski duznik"
      });

      var oznakaPoreskogPerioda = form.addField({
        id: "custpage_oznaka_poreskog_perioda",
        type: serverWidget.FieldType.SELECT,
        label: "Oznaka poreskog perioda"
      });
      oznakaPoreskogPerioda.addSelectOption({
        value: 1,
        text: "Mesecni"
      });
      oznakaPoreskogPerioda.addSelectOption({
        value: 3,
        text: "Kvartalni"
      });

      var povracaj = form.addField({
        id: "custpage_povracaj",
        type: serverWidget.FieldType.SELECT,
        label: "Povracaj"
      });
      povracaj.addSelectOption({
        value: -1,
        text: ""
      });
      povracaj.addSelectOption({
        value: 0,
        text: "Ne"
      });
      povracaj.addSelectOption({
        value: 1,
        text: "Da"
      });
      povracaj.updateLayoutType({
        layoutType: serverWidget.FieldLayoutType.NORMAL
      });
      povracaj.updateBreakType({
        breakType: serverWidget.FieldBreakType.STARTCOL
      });

      var izmenaPrijave = form.addField({
        id: "custpage_izmena_prijave",
        type: serverWidget.FieldType.SELECT,
        label: "Izmena prijave"
      });
      izmenaPrijave.addSelectOption({
        value: 0,
        text: "Prvobitna"
      });
      izmenaPrijave.addSelectOption({
        value: 1,
        text: "Izmenjena"
      });

      form.addField({
        id: "custpage_identifikacioni_broj_prijave",
        type: serverWidget.FieldType.TEXT,
        label: "Identifikacioni broj prijave koji se menja"
      });

      form.addSubmitButton({
        label: "Submit"
      });

      context.response.writePage(form);

    } else {
      var delimiter = /\u0001/;
      var dateStart = context.request.parameters.custpage_za_period_od;
      var dateEnd = context.request.parameters.custpage_za_period_do;
      var _organizacionaJedinica = context.request.parameters.custpage_organizaciona_jedinica;
      var _pib = context.request.parameters.custpage_pib;
      var _subsidiary = context.request.parameters.custpage_subsidiary;
      var _tipPodnosioca = context.request.parameters.custpage_tip_podnosioca;
      var _oznakaPoreskogPerioda = context.request.parameters.custpage_oznaka_poreskog_perioda;
      var _povracaj = context.request.parameters.custpage_povracaj;
      var _izmenaPrijave = context.request.parameters.custpage_izmena_prijave;
      var _identifikacioniBrojPrijave = context.request.parameters.custpage_identifikacioni_broj_prijave;

      var pdfStartDate = createPdfDate(dateStart);
      var xmlStartDate = createXmlDate(dateStart);
      var pdfEndDate = createPdfDate(dateEnd);
      var xmlEndDate = createXmlDate(dateEnd);

      log.debug('Before send request', 'Before send request');

      context.response.sendRedirect({
        type: http.RedirectType.SUITELET,
        identifier: "customscript_popdv_list_su_v2",
        id: "customdeploy_popdv_list_su_v2",
        parameters: {
          datestart: dateStart,
          pdfdatestart: pdfStartDate,
          xmldatestart: xmlStartDate,
          dateend: dateEnd,
          pdfdateend: pdfEndDate,
          xmldateend: xmlEndDate,
          organizacionajedinica: _organizacionaJedinica,
          pib: _pib,
          subsidiary: _subsidiary,
          tippodnosioca: _tipPodnosioca,
          oznakaporeskogperioda: _oznakaPoreskogPerioda,
          povracaj: _povracaj,
          izmenaprijave: _izmenaPrijave,
          identifikacionibrojprijave: _identifikacioniBrojPrijave
        }
      });

    }
  }

  return {
    onRequest: onRequest
  };
});
