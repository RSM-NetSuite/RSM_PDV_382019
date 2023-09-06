/**
 * dateUtil.js
 * @NApiVersion 2.x
 * @NModuleScope Public
 * 
 * Custom module which holds util functions for working mostly with dates
 * 
 * Variables:
 * 
 * izabraniDatum = chosen date
 * godinaIzabranogDatuma = year of chosen date
 * mesecIzabranogDatuma = month of chosen date
 * danIzabranogDatuma = day of chosen date
 * 
 * datumPocetkaAmortizacije = depreciation start date
 * godinaPocetkaAmortizacije = depreciation start year
 * 
 * datumRashoda = disposal date
 * mesecDatumaRashoda = month of disposal date
 * danDatumaRashoda = day of disposal date
 * 
 * praviloAmortizacije = depreciation rule
 * 
 * mesec = month
 * dan = day
 * 
 */

define(["N/config", 'N/format', "N/log"], function (config, format, log) {

  var dateUtil = {
    dateFormat: null,
    getDateFormat: function () {
      // Get current-in-use date format from system
      var configRecObject = config.load({
        type: config.Type.USER_PREFERENCES
      });
      var dateFormat = configRecObject.getValue({
        fieldId: "DATEFORMAT"
      });
      return dateFormat;
    },
    getYear: function (date) {
      return parseInt(date.match(/.*([\d]{4}).*/)[1]);
    },
    getMonth: function (date) {
      var months = {
        "Jan": 1,
        "Feb": 2,
        "Mar": 3,
        "Apr": 4,
        "May": 5,
        "Jun": 6,
        "Jul": 7,
        "Aug": 8,
        "Sep": 9,
        "Oct": 10,
        "Nov": 11,
        "Dec": 12
      };

      if (!dateUtil.dateFormat) {
        dateUtil.dateFormat = dateUtil.getDateFormat();
      }

      var index, len;
      if (dateUtil.dateFormat.match(/MONTH/)) {
        index = dateUtil.dateFormat.indexOf("MONTH");
        var month = date.match(/\d+[-| ]([A-Za-z]+)/)[1];
        month = month[0] + month.slice(1).toLowerCase();
        return months[month.substr(0, 3)];
      } else if (dateUtil.dateFormat.match(/Mon/)) {
        var month = date.match(/\d+[-| ]([A-Za-z]+)/)[1];
        return months[month];
      } else if (dateUtil.dateFormat.match(/MM/)) {
        index = dateUtil.dateFormat.indexOf("MM");
        len = 2;
      } else {
        index = dateUtil.dateFormat.indexOf("M");
        len = 1;
        var nextChar = date[index + 1];
        len = (nextChar < '0' || nextChar > '9') ? 1 : 2;
      }

      // Fix for date formats 2 and 4 in a row
      if ((dateUtil.dateFormat.match(/D\/M\/YYYY/) || dateUtil.dateFormat.match(/D\.M\.YYYY/)) && (date[1] >= '0' && date[1] <= '9')) {
        index += 1;
      }

      return parseInt(date.substr(index, len), 10);
    },
    getDay: function (date) {
      if (!dateUtil.dateFormat) {
        dateUtil.dateFormat = dateUtil.getDateFormat();
      }

      var index, len;
      if (dateUtil.dateFormat.match(/DD/)) {
        index = dateUtil.dateFormat.indexOf("DD");
        len = 2;
      } else if (dateUtil.dateFormat.match(/D/)) {
        index = dateUtil.dateFormat.indexOf("D");
        var nextChar = date[index + 1];
        len = (nextChar < '0' || nextChar > '9') ? 1 : 2;
      }
      return parseInt(date.substr(index, len), 10);
    },
    getNumberOfDaysInPeriod: function (argObj) {
      var date1, date2, day = 24 * 60 * 60 * 1000;

      // If asset is disposed
      if (argObj.isDisposed) {
        // Date1
        // If disposal year equals chosen date year and depr. start year
        if (argObj.godinaRashoda === argObj.godinaIzabranogDatuma &&
          argObj.godinaRashoda === argObj.godinaPocetkaAmortizacije) {
          date1 = new Date(
            argObj.godinaRashoda,
            dateUtil.getMonth(argObj.datumPocetkaAmortizacije) - 1,
            dateUtil.getDay(argObj.datumPocetkaAmortizacije)
          );
          // If disposal year is greater than chosen date year and chosen date year equals depr. start year
        } else if (argObj.godinaRashoda > argObj.godinaIzabranogDatuma && argObj.godinaIzabranogDatuma === argObj.godinaPocetkaAmortizacije) {
          date1 = new Date(
            argObj.godinaIzabranogDatuma,
            dateUtil.getMonth(argObj.datumPocetkaAmortizacije) - 1,
            dateUtil.getDay(argObj.datumPocetkaAmortizacije)
          );
        } else {
          date1 = new Date(argObj.godinaIzabranogDatuma, 0, 1); // january 1. of chosen date year
        }

        // Date2
        // If disposal year is greater than chosen date year, date2 month and day must be taken from chosen date
        if (argObj.godinaRashoda > argObj.godinaIzabranogDatuma) {
          date2 = new Date(
            argObj.godinaIzabranogDatuma,
            dateUtil.getMonth(argObj.izabraniDatum) - 1,
            dateUtil.getDay(argObj.izabraniDatum)
          );
          // Otherwise, compare disposal date and chosen date to determine earlier one and use it's month and day
        } else {
          var mesecIzabranogDatuma = dateUtil.getMonth(argObj.izabraniDatum) - 1;
          var mesecDatumaRashoda = dateUtil.getMonth(argObj.datumRashoda) - 1;
          var danIzabranogDatuma = dateUtil.getDay(argObj.izabraniDatum);
          var danDatumaRashoda = dateUtil.getDay(argObj.datumRashoda);
          if (mesecIzabranogDatuma === mesecDatumaRashoda) {
            mesec = mesecIzabranogDatuma;
            dan = Math.min(danIzabranogDatuma, danDatumaRashoda);
          } else {
            mesec = Math.min(mesecIzabranogDatuma, mesecDatumaRashoda);
            dan = (mesecIzabranogDatuma < mesecDatumaRashoda) ? danIzabranogDatuma : danDatumaRashoda;
          }
          date2 = new Date(
            argObj.godinaRashoda,
            mesec,
            dan
          );
        }
        // If asset is not disposed
      } else {
        // If chosen date year equals depr. start year, date 1 should be depr. start day and date2 should be chosen date
        if (argObj.godinaIzabranogDatuma === argObj.godinaPocetkaAmortizacije) {
          date1 = new Date(
            argObj.godinaIzabranogDatuma,
            dateUtil.getMonth(argObj.datumPocetkaAmortizacije) - 1,
            dateUtil.getDay(argObj.datumPocetkaAmortizacije)
          );
          date2 = new Date(
            argObj.godinaIzabranogDatuma,
            dateUtil.getMonth(argObj.izabraniDatum) - 1,
            dateUtil.getDay(argObj.izabraniDatum)
          );
          // otherwise, date 1 should be 1. january of the chosen date year and date2 should be chosen date
        } else {
          date1 = new Date(argObj.godinaIzabranogDatuma, 0, 1);
          date2 = new Date(
            argObj.godinaIzabranogDatuma,
            dateUtil.getMonth(argObj.izabraniDatum) - 1,
            dateUtil.getDay(argObj.izabraniDatum)
          );
        }
      }
      var diffTime = date2 - date1;
      var diffDays = Math.ceil(diffTime / day);
      return (diffDays > 0) ? diffDays : 0;
    },
    getNumberOfDaysInFirstYear: function (argObj) {
      var date1, date2, day = 24 * 60 * 60 * 1000;
      // Date 1 is depr. start date
      date1 = new Date(
        argObj.godinaPocetkaAmortizacije,
        dateUtil.getMonth(argObj.datumPocetkaAmortizacije) - 1,
        dateUtil.getDay(argObj.datumPocetkaAmortizacije)
      );
      // If chosen date year is greater than depr. start year, date 2 should be 31. december of depr. start year
      if (argObj.godinaIzabranogDatuma > argObj.godinaPocetkaAmortizacije) {
        date2 = new Date(argObj.godinaPocetkaAmortizacije, 11, 31);
        // Otherwise, date 2 should be chosen date 
      } else {
        date2 = new Date(
          argObj.godinaPocetkaAmortizacije,
          dateUtil.getMonth(argObj.izabraniDatum) - 1,
          dateUtil.getDay(argObj.izabraniDatum)
        );
      }
      var diffTime = date2 - date1;
      var diffDays = Math.ceil(diffTime / day);
      return (diffDays > 0) ? diffDays : 0;
    },
    getNumberOfDaysInDeprEndYear: function (argObj) {
      var date1, date2, day = 24 * 60 * 60 * 1000;
      // date1 should be 1. january of depr. end year
      date1 = new Date(argObj.godinaZavrsetkaAmortizacije, 0, 1);
      // date2 should be depr. end date
      date2 = new Date(
        argObj.godinaZavrsetkaAmortizacije,
        dateUtil.getMonth(argObj.datumZavrsetkaAmortizacije) - 1,
        dateUtil.getDay(argObj.datumZavrsetkaAmortizacije)
      );
      var diffTime = date2 - date1;
      var diffDays = Math.ceil(diffTime / day);
      return (diffDays > 0) ? diffDays : 0;
    },
    resolveDepreciationStartDate: function (deprRule, deprStartDate) {
      var newDeprStartDate;
      switch (deprRule) {
        // Prvi narednog meseca
        // First of next month
        case "Disposal":
          var month = dateUtil.getMonth(deprStartDate);
          var year = dateUtil.getYear(deprStartDate);
          var newMonth, year;
          if (month + 1 === 13) {
            newMonth = 1;
            year = year + 1;
          } else {
            newMonth = month + 1;
          }
          newDeprStartDate = dateUtil.createNewDateString(1, newMonth, year);
          break;
        // Prvi meseca kada je nabavljeno sredstvo
        // First of month when asset is purchased
        case "Acquisition":
          var year = dateUtil.getYear(deprStartDate);
          var month = dateUtil.getMonth(deprStartDate);
          newDeprStartDate = dateUtil.createNewDateString(1, month, year);
          break;
        // Prvi narednog meseca ili prvi meseca kada je sredstvo nabavljeno
        // First of next month or first of month when asset is purchased, depending on day
        case "Mid-month":
          var year = dateUtil.getYear(deprStartDate);
          var month = dateUtil.getMonth(deprStartDate);
          var day = dateUtil.getDay(deprStartDate);
          var newMonth = (day <= 15) ? month : month + 1;
          if (newMonth === 13) {
            newMonth = 1;
            year = year + 1;
          }
          newDeprStartDate = dateUtil.createNewDateString(1, newMonth, year);
          break;
        case "Pro-rata":
          // Amortizacija bi trebala da se racuna od dana kada je sredstvo nabavljeno.
          // Same date when asset is purchased
          newDeprStartDate = deprStartDate;
          break;
        default:
          newDeprStartDate = deprStartDate;
          break;
      }
      return newDeprStartDate;
    },
    resolveDepreciationEndDate: function (startDate, numberOfMonths) {
      var date = new Date(
        dateUtil.getYear(startDate),
        dateUtil.getMonth(startDate) - 1,
        dateUtil.getDay(startDate)
      );
      date = new Date(date.setMonth(date.getMonth() + numberOfMonths));
      return dateUtil.createNewDateString(date.getDate(), date.getMonth() + 1, date.getFullYear());
    },
    depreciationEnded: function (chosenDate, deprEndDate) {
      var chosenDateYear = dateUtil.getYear(chosenDate);
      var deprEndYear = dateUtil.getYear(deprEndDate);
      if (chosenDateYear > deprEndYear) {
        return true;
      } else if (chosenDateYear < deprEndYear) {
        return false;
      } else {
        var chosenDateMonth = dateUtil.getMonth(chosenDate);
        var deprEndMonth = dateUtil.getMonth(deprEndDate);
        if (chosenDateMonth > deprEndMonth) {
          return true;
        } else if (chosenDateMonth < deprEndMonth) {
          return false;
        } else {
          var chosenDateDay = dateUtil.getDay(chosenDate);
          var deprEndDay = dateUtil.getDay(deprEndDate);
          return (chosenDateDay <= deprEndDay) ? false : true;
        }
      }
    },
    createNewDateString: function (day, month, year) {
      var months = [
        {
          Mon: "Jan",
          MONTH: "January"
        },
        {
          Mon: "Feb",
          MONTH: "February"
        },
        {
          Mon: "Mar",
          MONTH: "March"
        },
        {
          Mon: "Apr",
          MONTH: "April"
        },
        {
          Mon: "May",
          MONTH: "May"
        },
        {
          Mon: "Jun",
          MONTH: "June"
        },
        {
          Mon: "Jul",
          MONTH: "July"
        },
        {
          Mon: "Aug",
          MONTH: "August"
        },
        {
          Mon: "Sep",
          MONTH: "September"
        },
        {
          Mon: "Oct",
          MONTH: "October"
        },
        {
          Mon: "Nov",
          MONTH: "November"
        },
        {
          Mon: "Dec",
          MONTH: "December"
        }
      ];

      if (!dateUtil.dateFormat) {
        dateUtil.dateFormat = dateUtil.getDateFormat();
      }

      var resDate;
      if (dateUtil.dateFormat.match(/MONTH/)) {
        resDate = dateUtil.dateFormat.replace(/MONTH/, months[month - 1]["MONTH"]);
      } else if (dateUtil.dateFormat.match(/Mon/)) {
        resDate = dateUtil.dateFormat.replace(/Mon/, months[month - 1]["Mon"]);
      } else if (dateUtil.dateFormat.match(/MM/)) {
        resDate = dateUtil.dateFormat.replace(/MM/, (month < 10) ? "0" + month : month);
      } else {
        resDate = dateUtil.dateFormat.replace(/M/, month);
      }
      if (dateUtil.dateFormat.match(/DD/)) {
        resDate = resDate.replace(/DD/, (day < 10) ? "0" + day : day);
      } else {
        resDate = resDate.replace(/D/, day);
      }
      resDate = resDate.replace(/YYYY/, year);

      return resDate;
    },
    createCurrentNSDate: function createCurrentNSDate() {
      var date = new Date();
      return dateUtil.createNewDateString(date.getDate(), date.getMonth() + 1, date.getFullYear());
    },
    formatDate: function formatDate(date) {
      if (!date || date === '' || date === ' ') {
        return '';
      }
      // Returns string in specified timezone
      return format.format({
        value: date,
        type: format.Type.DATETIME,
        timezone: format.Timezone.EUROPE_BUDAPEST
      });
    },
    parseDate: function parseDate(dateString) {
      // Returns date object in specified timezone
      if (!dateString || dateString === '' || dateString === ' ') {
        return '';
      }
      return format.parse({
        value: dateString,
        type: format.Type.DATETIME,
        timezone: format.Timezone.EUROPE_BUDAPEST
      });
    },
    getDateFromFormattedDate: function getDateFromFormattedDate(dateString) {
      if (!dateString || dateString === '' || dateString === ' ') {
        return '';
      }
      return dateString.split(' ')[0];
    }
  }

  return {
    dateUtil: dateUtil
  }
});