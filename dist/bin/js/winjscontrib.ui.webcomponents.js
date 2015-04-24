/* 
 * WinJS Contrib v2.1.0.0
 * licensed under MIT license (see http://opensource.org/licenses/MIT)
 * sources available at https://github.com/gleborgne/winjscontrib
 */

/*
WARNING: this feature is experimental
You must add winjscontrib.core.js before this file
*/

/// <reference path="winjscontrib.core.js" />
var WinJSContrib = WinJSContrib || {};
WinJSContrib.UI = WinJSContrib.UI || {};
WinJSContrib.UI.WebComponents = WinJSContrib.UI.WebComponents || {};

(function (global) {
	'use strict';
	var registered = {};
	WinJSContrib.UI.WebComponents.registered = registered;
	WinJSContrib.UI.WebComponents.polyfill = false;

	if (!global.document.registerElement && global.MutationObserver) {
		WinJSContrib.UI.WebComponents.polyfill = true;
	}

	function inspect(node) {
		var customElement = null;
		var ctrlName = node.nodeName;
		if (node.nodeName !== '#text') {
			if (node.attributes) {
				var ctrlName = node.getAttribute("is");
				if (ctrlName) {
					//we uppercase because node names are uppercase
					customElement = registered[ctrlName.toUpperCase()];
				}
			}

			if (!customElement && node.nodeName !== 'DIV' && node.nodeName !== 'SPAN') {
				customElement = registered[node.nodeName];
			}

			if (customElement && !node.mcnComponent) {
				createElement(node, customElement);
			}

			if (node.msParentSelectorScope && node.winControl && node.winControl.pageLifeCycle && node.winControl.pageLifeCycle.observer) {
				//element is a fragment with its own mutation observer, no need to inspect childs
				return;
			}

			for (var i = 0, l = node.childNodes.length; i < l; i++) {
				inspect(node.childNodes[i]);
			}
		}
	}

	if (WinJSContrib.UI.WebComponents.polyfill) {
		WinJSContrib.UI.WebComponents.inspect = inspect;
	} else {
		WinJSContrib.UI.WebComponents.inspect = function () { };
	}

	function observeMutations(element) {
		var observer = null;
		if (WinJSContrib.UI.WebComponents.polyfill) {
			observer = new MutationObserver(function (mutations) {
				//console.time('check mutation');
				mutations.forEach(function (mutation) {
					if (mutation.addedNodes.length) {
						for (var i = 0, l = mutation.addedNodes.length; i < l ; i++) {
							inspect(mutation.addedNodes[i]);
						}
					}
				});
				//console.timeEnd('check mutation');
			});

			observer.observe(element, { childList: true, subtree: true });
		}

		return observer;
	}
	WinJSContrib.UI.WebComponents.watch = observeMutations;

	function createElement(element, definition) {
		var ctrl = element.winControl;
		element.mcnComponent = true;
		var scope = WinJSContrib.Utils.getScopeControl(element);
		var process = function () {
			getControlInstance(definition.ctor, element);
		}

		if (scope && scope.pageLifeCycle) {
			//if the component is owned by a page/fragment, we process the control according to page lifecycle
			scope.pageLifeCycle.steps.process.attach(process);
		} else {
			process();
		}

		//put a proxy on setAttribute to detect changes in attributes
		var setAttribute = element.setAttribute;
		element.setAttribute = function (name, val) {
			if (element.winControl) {
				setAttribute.call(this, name, val);
				var map = element.winControl.constructor.mcnWebComponent;
				if (map) {
					map.applyAttribute(name, this);
				}
			}
		}
	}

	function getControlInstance(ctor, element) {
		element.mcnComponent = true;
		var definition = ctor.mcnWebComponent;
		//console.time('building ' + definition.name);
		var options = {};
		if (element.dataset.winOptions) {
			options = getWinJSOptions(element);
		}

		if (definition && definition.optionsCallback) {
			options = definition.optionsCallback(element, options, scope);
		}

		var ctrl = new ctor(element, options);
		element.winControl = ctrl;
		if (definition) {
			definition.applyAll(element);
		}
		//console.timeEnd('building ' + definition.name);		
	}

	function applyMapping(tagname, ctor, mapping) {
		if (typeof mapping == 'function')
			return;
		mapping = mapping || {};

		ctor.mcnWebComponent = {
			name: tagname,
			map: mapping.map || {},
			optionsCallback: mapping.optionsCallback,
			applyAll: function (element) {
				for (var item in this.map) {
					this.applyAttribute(item, element);
				}
			},
			applyAttribute: function (name, element, attrvalue) {
				var map = this.map[name.toUpperCase()];
				if (map) {
					var val = attrvalue || element.getAttribute(map.attribute);
					var ctrl = element.winControl;
					if (val && ctrl) {
						if (map.resolve) {
							WinJSContrib.Utils.applyValue(element, val, ctrl, map.property);
							return;
						}

						WinJSContrib.Utils.writeProperty(ctrl, map.property, val);
					}
				}
			}
		}

		if (mapping.props) {
			mapping.props.forEach(function (p) {
				if (p) {
					ctor.mcnWebComponent.map[p.toUpperCase()] = { attribute: p, property: p, resolve: true };
				}
			});
		}

		if (mapping.controls) {
			for (var ctKey in mapping.controls) {
				var control = mapping.controls[ctKey];
				var controlDefinition = control.mcnWebComponent;
				for (var mapKey in controlDefinition.map) {
					var key = ctKey + '.' + mapKey;
					var controlmap = controlDefinition.map[mapKey];
					ctor.mcnWebComponent.map[key.toUpperCase()] = {
						attribute: ctKey + '.' + controlmap.attribute,
						property: ctKey + '.' + controlmap.property,
						resolve: controlmap.resolve
					};
				}
			}
		}
	}

	WinJSContrib.UI.WebComponents.register = function register(tagname, ctor, mapping, override) {
		var existing = registered[tagname.toUpperCase()];
		if (existing && !override) {
			throw 'component ' + tagname + ' already exists';
		}

		applyMapping(tagname, ctor, mapping);

		if (WinJSContrib.UI.WebComponents.polyfill) {
			global.document.createElement(tagname);
			//we uppercase because node names are uppercase
			registered[tagname.toUpperCase()] = { ctor: ctor };
		} else if (global.document.registerElement) {
			//register component with "real" webcomponent
			var proto = Object.create(HTMLElement.prototype);
			proto.createdCallback = function () {
				getControlInstance(ctor, this);
			};

			proto.attributeChangedCallback = function (attrName, oldValue, newValue) {
				if (this.winControl) {
					var map = this.winControl.constructor.mcnWebComponent;
					if (map) {
						map.applyAttribute(attrName, this, newValue);
					}
				}				
			};

			global.document.registerElement(tagname, { prototype: proto });
		}
	}

	function getWinJSOptions(elt) {
		return WinJS.UI.optionsParser(elt.dataset.winOptions, window, {
			select: WinJS.Utilities.markSupportedForProcessing(function (text) {
				var parent = WinJSContrib.Utils.getScopeControl(elt);
				if (parent) {
					return parent.element.querySelector(text);
				}
				else {
					return document.querySelector(text);
				}
			})
		});
	}



	if (WinJS.Binding && WinJS.Binding.Template) {
		WinJSContrib.UI.WebComponents.register('win-template', WinJS.Binding.Template, {
			props: ['extractChild']
		});
	}

	if (WinJS.UI && WinJS.UI.AppBar) {
		WinJSContrib.UI.WebComponents.register('win-appbar', WinJS.UI.AppBar, {
			props: ['closedDisplayMode', 'disabled', 'hidden', 'layout', 'placement', 'sticky', 'commands', 
				'onafterhide', 'onaftershow', 'onbeforehide', 'onbeforeshow']
		});
	}

	if (WinJS.UI && WinJS.UI.AutoSuggestBox) {
		WinJSContrib.UI.WebComponents.register('win-autosuggestbox', WinJS.UI.AutoSuggestBox, {
			props: ['chooseSuggestionOnEnter', 'disabled', 'onquerychanged', 'onquerysubmitted', 
				'onresultsuggestionchosen', 'onsuggestionsrequested', 'placeholderText', 'queryText', 
				'searchHistoryContext', 'searchHistoryDisabled']
		});
	}

	if (WinJS.UI && WinJS.UI.BackButton) {
		WinJSContrib.UI.WebComponents.register('win-backbutton', WinJS.UI.BackButton);
	}

	if (WinJS.UI && WinJS.UI.ContentDialog) {
		WinJSContrib.UI.WebComponents.register('win-contentdialog', WinJS.UI.ContentDialog, {
			props: ['hidden', 'primaryCommandDisabled', 'primaryCommandText', 'secondaryCommandDisabled',
				'secondaryCommandText', 'title', 'onafterhide', 'onaftershow', 'onbeforehide', 'onbeforeshow']
		});
	}

	if (WinJS.UI && WinJS.UI.DatePicker) {
		WinJSContrib.UI.WebComponents.register('win-datepicker', WinJS.UI.DatePicker, {
			props: ['calendar', 'datePattern', 'disabled', 'maxYear', 'minYear', 
				'monthPattern', 'yearPattern', 'onchange', 'current']
		});
	}

	if (WinJS.UI && WinJS.UI.FlipView) {
		WinJSContrib.UI.WebComponents.register('win-flipview', WinJS.UI.FlipView, {
			props: ['itemTemplate', 'itemDataSource']
		});
	}

	if (WinJS.UI && WinJS.UI.Flyout) {
		WinJSContrib.UI.WebComponents.register('win-flyout', WinJS.UI.Flyout, {
			props: ['alignment', 'anchor', 'disabled', 'hidden', 'placement', 
				'onafterhide', 'onaftershow', 'onbeforehide', 'onbeforeshow']
		});
	}

	if (WinJS.UI && WinJS.UI.Hub) {
		WinJSContrib.UI.WebComponents.register('win-hub', WinJS.UI.Hub, {
			props: ['headerTemplate', 'indexOfFirstVisible', 'indexOfLastVisible', 'loadingState', 
				'oncontentanimating', 'onheaderinvoked', 'onloadingstatechanged', 
				'orientation', 'scrollPosition', 'sectionOnScreen', 'sections', 'zoomableView']
		});
	}

	if (WinJS.UI && WinJS.UI.HubSection) {
		WinJSContrib.UI.WebComponents.register('win-hubsection', WinJS.UI.HubSection, {
			props: ['contentElement', 'header', 'isHeaderStatic']
		});
	}

	if (WinJS.UI && WinJS.UI.ItemContainer) {
		WinJSContrib.UI.WebComponents.register('win-itemcontainer', WinJS.UI.ItemContainer, {
			props: ['draggable', 'oninvoked', 'onselectionchanged', 'onselectionchanging', 'selected', 'selectionDisabled', 
				'swipeBehavior', 'swipeOrientation', 'tapBehavior']
		});
	}

	if (WinJS.UI && WinJS.UI.ListView) {
		WinJSContrib.UI.WebComponents.register('win-listview', WinJS.UI.ListView, {
			props: [
				'itemTemplate', 'itemDataSource', 'itemsDraggable', 'itemsReorderable',
				'oniteminvoked', 'groupHeaderTemplate', 'groupDataSource', 'swipeBehavior',
				'selectBehavior', 'tapBehavior', 'header', 'footer'
			]
		});
	}

	if (WinJS.UI && WinJS.UI.Menu) {
		WinJSContrib.UI.WebComponents.register('win-menu', WinJS.UI.Menu, {
			props: ['alignment', 'anchor', 'commands', 'disabled', 'hidden', 'placement', 
				'onafterhide', 'onaftershow', 'onbeforehide', 'onbeforeshow']
		});
	}

	if (WinJS.UI && WinJS.UI.Pivot) {
		WinJSContrib.UI.WebComponents.register('win-pivot', WinJS.UI.Pivot, {
			props: ['items', 'locked', 'onitemanimationend', 'onitemanimationstart', 'onselectionchanged', 
				'selectedIndex', 'selectedItem', 'title']
		});
	}

	if (WinJS.UI && WinJS.UI.PivotItem) {
		WinJSContrib.UI.WebComponents.register('win-pivotitem', WinJS.UI.PivotItem, {
			props: ['contentElement', 'header']
		});
	}

	if (WinJS.UI && WinJS.UI.Rating) {
		WinJSContrib.UI.WebComponents.register('win-rating', WinJS.UI.Rating, {
			props: ['averageRating', 'disabled', 'enableClear', 'maxRating', 
				'oncancel', 'onchange', 'onpreviewchange', 'tooltipStrings', 'userRating']
		});
	}

	if (WinJS.UI && WinJS.UI.Repeater) {
		WinJSContrib.UI.WebComponents.register('win-repeater', WinJS.UI.Repeater, {
			props: ['data', 'length', 'onitemchanged', 'onitemchanging', 'oniteminserted', 'oniteminserting', 
				'onitemmoved', 'onitemmoving', 'onitemremoved', 'onitemremoving', 'onitemsloaded', 
				'onitemsreloaded', 'onitemsreloading', 'template'] 
		});
	}

	if (WinJS.UI && WinJS.UI.SearchBox) {
		WinJSContrib.UI.WebComponents.register('win-searchbox', WinJS.UI.SearchBox, {
			props: ['chooseSuggestionOnEnter', 'disabled', 'focusOnKeyboardInput', 'onquerychanged', 'onquerysubmitted', 
				'onresultsuggestionchosen', 'onsuggestionsrequested', 'placeholderText', 'queryText', 
				'searchHistoryContext', 'searchHistoryDisabled']
		});
	}

	if (WinJS.UI && WinJS.UI.SemanticZoom) {
		WinJSContrib.UI.WebComponents.register('win-semanticzoom', WinJS.UI.SemanticZoom, {
			props: ['enableButton', 'locked', 'onzoomchanged', 'zoomedInItem', 'zoomedOut', 'zoomedOutItem', 'zoomFactor']
		});
	}

	if (WinJS.UI && WinJS.UI.SplitView) {
		WinJSContrib.UI.WebComponents.register('win-splitview', WinJS.UI.SplitView, {
			props: ['contentElement', 'hiddenDisplayMode', 'paneElement', 'paneHidden', 'panePlacement', 'shownDisplayMode',
				'onafterhide', 'onaftershow', 'onbeforehide', 'onbeforeshow']
		});
	}

	if (WinJS.UI && WinJS.UI.TimePicker) {
		WinJSContrib.UI.WebComponents.register('win-timepicker', WinJS.UI.TimePicker, {
			props: ['onchange', 'clock', 'current', 'disabled', 'hourPattern',
				'minuteIncrement', 'minutePattern', 'periodPattern']
		});
	}

	if (WinJS.UI && WinJS.UI.ToggleSwitch) {
		WinJSContrib.UI.WebComponents.register('win-toggleswitch', WinJS.UI.ToggleSwitch, {
			props: ['onchange', 'checked', 'disabled', 'labelOff', 'labelOn', 'title']
		});
	}

	if (WinJS.UI && WinJS.UI.ToolBar) {
		WinJSContrib.UI.WebComponents.register('win-toolbar', WinJS.UI.ToolBar);
	}

	if (WinJS.UI && WinJS.UI.Tooltip) {
		WinJSContrib.UI.WebComponents.register('win-tooltip', WinJS.UI.Tooltip, {
			props: ['contentElement', 'extraClass', 'infotip', 'innerHTML', 'onbeforeclose', 
				'onbeforeopen',  'onclosed', 'onopened', 'placement']
		});
	}

	if (WinJS.UI && WinJS.UI.ViewBox) {
		WinJSContrib.UI.WebComponents.register('win-viewbox', WinJS.UI.ViewBox);
	}


	/*
				WinJS.UI.MenuCommand
				WinJS.UI.NavBar
				WinJS.UI.NavBarCommand
				WinJS.UI.NavBarContainer
				Toolbar
	*/
})(this);