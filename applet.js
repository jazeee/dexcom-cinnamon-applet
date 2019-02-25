"use strict";

//----------------------------------
// imports
//----------------------------------

/**
 * /usr/share/gjs-1.0/
 * /usr/share/gnome-js/
 */
const Cairo = imports.cairo
const Lang = imports.lang
// http://developer.gnome.org/glib/unstable/glib-The-Main-Event-Loop.html
const Main = imports.ui.main
const Mainloop = imports.mainloop

/**
 * /usr/share/gjs-1.0/overrides/
 * /usr/share/gir-1.0/
 * /usr/lib/cinnamon/
 */
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk
// http://developer.gnome.org/libsoup/stable/libsoup-client-howto.html
const Soup = imports.gi.Soup
// http://developer.gnome.org/st/stable/
const St = imports.gi.St
/**
 * /usr/share/cinnamon/js/
 */
const Applet = imports.ui.applet
const Config = imports.misc.config
const PopupMenu = imports.ui.popupMenu
const Settings = imports.ui.settings
const Util = imports.misc.util

"use strict";

//----------------------------------------------------------------------
//
// Constants
//
//----------------------------------------------------------------------

const UUID = "dexcom@jazeee-uuid"
const APPLET_ICON = "view-refresh-symbolic"
const CMD_SETTINGS = "cinnamon-settings applets " + UUID

// Magic strings
const BLANK = '   '
const ELLIPSIS = '...'
const EN_DASH = '\u2013'

const QUERY_URL = "https://share1.dexcom.com/ShareWebServices/Services";
let SESSION_ID = null;
let LAST_SESSION_ID_REQUEST_DATE = 0;

// Schema keys
// https://github.com/linuxmint/Cinnamon/wiki/Applet,-Desklet-and-Extension-Settings-Reference
const DEXCOM_ACCOUNT_NAME = 'accountName'
const DEXCOM_PASSWORD_FILENAME = 'passwordFilename'
const DEXCOM_REFRESH_INTERVAL = 'refreshInterval'

const KEYS = [
  DEXCOM_ACCOUNT_NAME,
  DEXCOM_PASSWORD_FILENAME,
  DEXCOM_REFRESH_INTERVAL,
]

// Signals
const SIGNAL_CHANGED = 'changed::'
const SIGNAL_CLICKED = 'clicked'
const SIGNAL_REPAINT = 'repaint'

// stylesheet.css
const STYLE_LOCATION_LINK = 'dexcom-current-location-link'
const STYLE_SUMMARYBOX = 'dexcom-current-summarybox'
const STYLE_SUMMARY = 'dexcom-current-summary'
const STYLE_DATABOX = 'dexcom-current-databox'
const STYLE_ICON = 'dexcom-current-icon'
const STYLE_ICONBOX = 'dexcom-current-iconbox'
const STYLE_DATABOX_CAPTIONS = 'dexcom-current-databox-captions'
const STYLE_CONFIG = 'dexcom-config'
const STYLE_DATABOX_VALUES = 'dexcom-current-databox-values'
const STYLE_PANEL_BUTTON = 'panel-button'
const STYLE_POPUP_SEPARATOR_MENU_ITEM = 'popup-separator-menu-item'
const STYLE_CURRENT = 'current'
const STYLE_DEXCOM_MENU = 'dexcom-menu'

var dexcom = {
  glucoseValue: null,
  date: null,
  trend: null,
};

let AppletDir;
let IconPaths = {};
///////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////

//----------------------------------------------------------------------
//
// Soup
//
//----------------------------------------------------------------------

// Soup session (see https://bugzilla.gnome.org/show_bug.cgi?id=661323#c64)
const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());

function log(message) {
  global.log(UUID + "#" + message)
}

function logError(error) {
  global.logError(UUID + "#" + error)
}


//----------------------------------------------------------------------
//
// MyApplet
//
//----------------------------------------------------------------------

function MyApplet(metadata, orientation, panelHeight, instanceId) {
  this.settings = new Settings.AppletSettings(this, UUID, instanceId);
  log(panelHeight);
  this._init(orientation, panelHeight, instanceId);
}

MyApplet.prototype = {
  __proto__: Applet.TextIconApplet.prototype,

  refreshAndRebuild: function refreshAndRebuild() {
    this.refreshDexcom(false)
    this.rebuild()
  },

    // Override Methods: TextIconApplet
  _init: function _init(orientation, panelHeight, instanceId) {
    Applet.TextIconApplet.prototype._init.call(this, orientation, panelHeight, instanceId);

    // Interface: TextIconApplet
    this.set_applet_icon_name(APPLET_ICON)
    this.set_applet_label(_("j.a.z."))
    this.set_applet_tooltip(_("Click to open"))
    this._icon_type = St.IconType.SYMBOLIC;
    // PopupMenu
    this.menuManager = new PopupMenu.PopupMenuManager(this)
    this.menu = new Applet.AppletPopupMenu(this, orientation)
    if (typeof this.menu.setCustomStyleClass === "function")
        this.menu.setCustomStyleClass(STYLE_DEXCOM_MENU);
    else
        this.menu.actor.add_style_class_name(STYLE_DEXCOM_MENU);
    this.menuManager.addMenu(this.menu)
    log("add menu");
    //----------------------------------
    // bind settings
    //----------------------------------

    for (let k in KEYS) {
      let key = KEYS[k]
      let keyProp = "_" + key
      this.settings.bindProperty(Settings.BindingDirection.IN, key, keyProp,
                                 this.refreshAndRebuild, null)
    }
    log("bound settings")
    this.settings.connect(SIGNAL_CHANGED + DEXCOM_ACCOUNT_NAME, Lang.bind(this, function() {
      LAST_SESSION_ID_REQUEST_DATE = 0;
      this.refreshAfterAFew()
    }));
    this.settings.connect(SIGNAL_CHANGED + DEXCOM_PASSWORD_FILENAME, Lang.bind(this, function() {
      LAST_SESSION_ID_REQUEST_DATE = 0;
      this.refreshAfterAFew()
    }));

    // configuration via context menu is automatically provided in Cinnamon 2.0+
    let cinnamonVersion = Config.PACKAGE_VERSION.split('.')
    let majorVersion = parseInt(cinnamonVersion[0])
    log("cinnamonVersion=" + cinnamonVersion +  "; majorVersion=" + majorVersion)

    //------------------------------
    // render graphics container
    //------------------------------

    // build menu
    let mainBox = new St.BoxLayout({ vertical: true })
    this.menu.addActor(mainBox)

    this._currentUi = new St.Bin({ style_class: STYLE_CURRENT })
    mainBox.add_actor(this._currentUi)

    //  horizontal rule
    this._separatorArea = new St.DrawingArea({ style_class: STYLE_POPUP_SEPARATOR_MENU_ITEM })
    this._separatorArea.width = 200
    this._separatorArea.connect(SIGNAL_REPAINT, Lang.bind(this, this._onSeparatorAreaRepaint))
    mainBox.add_actor(this._separatorArea)
    log("Rebuilding");
    this.rebuild()
    log("Rebuild done");
    //------------------------------
    // run
    //------------------------------
    this.refreshAfterAFew()
    this.orientation = orientation;
    log("Orientation: " + orientation);
    try {
        this.setAllowedLayout(Applet.AllowedLayout.BOTH);
        this.update_label_visible();
    } catch(e) {
      logError(e);
        // vertical panel not supported
    }
    log("Done _init");
  },
  refreshAfterAFew: function refreshAfterAFew() {
    Mainloop.timeout_add_seconds(3, Lang.bind(this, function mainloopTimeout() {
      log("Refreshing Dexcom");
      this.refreshDexcom(true)
    }));
  },
  update_label_visible: function () {
    if (this.orientation == St.Side.LEFT || this.orientation == St.Side.RIGHT)
      this.hide_applet_label(true);
    else
      this.hide_applet_label(false);
  },

  on_orientation_changed: function (orientation) {
      this.orientation = orientation;
      this.refreshDexcom()
  },

  on_applet_clicked: function on_applet_clicked(event) {
    this.menu.toggle()
  },

  _onSeparatorAreaRepaint: function onSeparatorAreaRepaint(area) {
    let cr = area.get_context()
    let themeNode = area.get_theme_node()
    let [width, height] = area.get_surface_size()
    let margin = themeNode.get_length('-margin-horizontal')
    let gradientHeight = themeNode.get_length('-gradient-height')
    let startColor = themeNode.get_color('-gradient-start')
    let endColor = themeNode.get_color('-gradient-end')
    let gradientWidth = (width - margin * 2)
    let gradientOffset = (height - gradientHeight) / 2
    let pattern = new Cairo.LinearGradient(margin, gradientOffset, width - margin, gradientOffset + gradientHeight)

    pattern.addColorStopRGBA(0, startColor.red / 255, startColor.green / 255, startColor.blue / 255, startColor.alpha / 255)
    pattern.addColorStopRGBA(0.5, endColor.red / 255, endColor.green / 255, endColor.blue / 255, endColor.alpha / 255)
    pattern.addColorStopRGBA(1, startColor.red / 255, startColor.green / 255, startColor.blue / 255, startColor.alpha / 255)
    cr.setSource(pattern)
    cr.rectangle(margin, gradientOffset, gradientWidth, gradientHeight)
    cr.fill()
  },

  //----------------------------------------------------------------------
  //
  // Methods
  //
  //----------------------------------------------------------------------

  displayLabelError: function(errorMsg) {
    this.set_applet_label(errorMsg);
    this.set_applet_tooltip("Click to open");
    this.set_applet_icon_name("");
  },

  refreshDexcom: function refreshDexcom(recurse) {
    this.getDexcomReading();
    if (recurse) {
      Mainloop.timeout_add_seconds(this._refreshInterval * 60 + 5, Lang.bind(this, function() {
        this.refreshDexcom(true)
      }))
    }
  },

  displayGlucose: function() {
    this.set_applet_tooltip("Jaz");

    this._currentUiSummary.text = "Jaz";

    let iconname = "weather-severe-alert";
    this._currentUiIcon.icon_name = iconname
    this._icon_type == St.IconType.SYMBOLIC ?
      this.set_applet_icon_symbolic_name(iconname) :
      this.set_applet_icon_name(iconname)

    let glucoseValue = dexcom.glucoseValue || "";
    this.set_applet_label("" + glucoseValue);

    try {
      this.update_label_visible();
    } catch(e) {
        // vertical panel not supported
    }
  },

  destroyCurrentUi: function destroyCurrentUi() {
    if (this._currentUi.get_child() != null)
      this._currentUi.get_child().destroy()
  },

  showLoadingUi: function showLoadingUi() {
    this.destroyCurrentUi()
    this._currentUi.set_child(new St.Label({ text: _('Loading...') }))
  },

  rebuild: function rebuild() {
    this.showLoadingUi()
    this.rebuildCurrentUi()
  },

  rebuildCurrentUi: function rebuildCurrentUi() {
    this.destroyCurrentUi()

    // This will hold the icon for the current dexcom
    this._currentUiIcon = new St.Icon({
      icon_type: this._icon_type,
      icon_size: 64,
      icon_name: APPLET_ICON,
      style_class: STYLE_ICON
    })

    // The summary of the current dexcom
    this._currentUiSummary = new St.Label({
      text: _('Loading ...'),
      style_class: STYLE_SUMMARY
    })

    let bb = new St.BoxLayout({
      vertical: true,
      style_class: STYLE_SUMMARYBOX
    })
    let textOb = { text: dexcom.glucoseValue || ELLIPSIS }
    this._currentUiTemperature = new St.Label(textOb)
    let rb = new St.BoxLayout({
      style_class: STYLE_DATABOX
    })
    let rb_captions = new St.BoxLayout({
      vertical: true,
      style_class: STYLE_DATABOX_CAPTIONS
    })
    let rb_values = new St.BoxLayout({
      vertical: true,
      style_class: STYLE_DATABOX_VALUES
    })
    log("Before1 add rb");
    rb.add_actor(rb_captions)
    rb.add_actor(rb_values)
    log("Before add rb");
    rb_captions.add_actor(new St.Label({text: _('Glucose:')}))
    rb_values.add_actor(this._currentUiTemperature)

    let xb = new St.BoxLayout()
    xb.add_actor(rb)
    log("After add rb");

    let box = new St.BoxLayout({
      style_class: STYLE_ICONBOX
    });
    log("After icon");
    box.add_actor(this._currentUiIcon)
    box.add_actor(xb)
    this._currentUi.set_child(box)
  },

  //----------------------------------------------------------------------
  //
  // Utility functions
  //
  //----------------------------------------------------------------------

  // Takes Time in %H:%M string format
  timeToUserUnits: function(time) {
    time = time.split(':');
    //Remove Leading 0
    if (time[0].charAt(0) == "0") {
      time[0] = time[0].substr(1);
    }
    if (time[0] > 12) { // PM
      return (time[0] - 12) + ":" + time[1] + " Pm";
    }
    else { //AM
      return time[0] + ":" + time[1] + " Am";
    }
  },

  nonempty: function(str) {
    return (str != null && str.length > 0)
  },

//////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////
///////////                                       ////////////
///////////       DexcomService Functions        ////////////
///////////                                       ////////////
//////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////
  readFile: function readFile(filename) {
    log("Reading from: " + filename);
    if (!filename || filename === "") {
      return "";
    }
    filename = filename.replace("file://", "");
    try {
      return String(GLib.file_get_contents(filename)[1]);
    } catch (error) {
      logError(error.toString());
      return "";
    }
  },
  loadJsonAsync: function loadJsonAsync(url, body, callback) {
    let context = this
    // See: https://gist.github.com/jaszhix/215306816e15b3cf78af6369700ab97b
    let message = Soup.Message.new('POST', url);
    if (body) {
      const bodyJson = JSON.stringify(body);
      message.set_request('application/json', Soup.MemoryUse.COPY, bodyJson, bodyJson.length);
    }
    message.request_headers.set_content_type('application/json', {});

    // message.response_headers.set_content_type('application/json', {});
    _httpSession.queue_message(message, function soupQueue(session, message) {
      callback.call(context, message.response_body.data)
    })
  },

  getAuthToken: function getAuthToken(callback) {
    const now = Date.now();
    if ( now - LAST_SESSION_ID_REQUEST_DATE < 30 * 60 * 1000) {
      callback(SESSION_ID);
      return;
    }
    LAST_SESSION_ID_REQUEST_DATE = now;
    let context = this;
    let query = QUERY_URL + "/General/LoginPublisherAccountByName";
    const accountName = this._accountName;
    log("account: " + accountName);
    let password = this.readFile(this._passwordFilename);
    log("pa" + password[1]);
    if (!accountName || !password) {
      logError("Need Creds");
      return;
    }
    const body = {
      applicationId:"d8665ade-9673-4e27-9ff6-92db4ce13d13",
      accountName: accountName,
      password: password.toString().trim(),
    };
    this.loadJsonAsync(query, body, function(sessionId) {
      SESSION_ID = JSON.parse(sessionId);
      callback.call(context, SESSION_ID);
    });
  },
  // Only have Mainloop Polling in one of the functions with API calls
  // because it will cause a exponential recursive loop otherwise

  getDexcomReading: function getDexcomReading() {
    this.getAuthToken(function(sessionId) {
      if (!sessionId) {
        logError("Unable to auth");
        return false;
      }
      let query = QUERY_URL + "/Publisher/ReadPublisherLatestGlucoseValues?";
      query += "sessionId=" + sessionId + "&minutes=1440&maxCount=1";
      log(query);
      this.loadJsonAsync(query, null, function(data) {
        log("Response: " + data);
        const json = JSON.parse(data);
        if (!this.isResponseValid(json)) {
          Mainloop.timeout_add_seconds(30, Lang.bind(this, function() {
            this.refreshDexcom(false)
          }));
          return false;
        }
        this.parseDexcomJson(json);
        this.displayGlucose();
        return true;
      });
    });
  },

  isResponseValid: function(response) {
    if (!response) {
      this.displayLabelError(_("Service Unavailable"));
      logError("Service Unavailable");
      return false;
    }
    return true;
  },

  parseDexcomJson: function(json) {
    if (!json || !json[0]) {
      logError("No json values: " + json);
      return;
    }
    const data = json[0];
    dexcom.glucoseValue = data.Value;
    dexcom.date = data.DT;
    dexcom.trend = data.Trend;
    log("Values: " + JSON.stringify(dexcom));
  },
};

//----------------------------------------------------------------------
//
// Entry point
//
//----------------------------------------------------------------------

function main(metadata, orientation, panelHeight, instanceId) {
  log("v" + metadata.version + ", cinnamon " + Config.PACKAGE_VERSION)
  AppletDir = imports.ui.appletManager.appletMeta[metadata.uuid].path;
  IconPaths.trends = [];
  for ( let i = 0; i < 8; i++) {
    IconPaths.trends.push(AppletDir + "/trend-" + i + ".png");
    //         this.set_applet_icon_path(Filepath);
  }
  return new MyApplet(metadata, orientation, panelHeight, instanceId)
}
