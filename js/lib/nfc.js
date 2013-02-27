/******************************************************************************
 * Copyright 2012 Intel Corporation.
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *****************************************************************************/



/*****************************************************************************/

var nfc = window.nfc = {};

nfc.reset = function() {
	nfc.busName = "org.neard";
	nfc.bus = null;
	nfc.uri = null;
	nfc.manager = null;
	nfc.adapter = null;
	nfc.defaultAdapter = null;
	nfc.service = "org.cloudeebus";
};


nfc.init = function(uri, manifest, successCB, errorCB) {
	nfc.reset();
	
	function onAdapterPropsOk(props) {
		nfc.adapter.props = props;
		nfc.defaultAdapter = new nfc.NFCAdapter(nfc.adapter);
		if (successCB)
			successCB();		
	}
	
	function onAdapterOk() {
		nfc.adapter.GetProperties(onAdapterPropsOk, errorCB);
	}
	
	function onManagerPropsOk(props) {
		if (props.Adapters.length == 0)
			errorCB("No NFC Adapter found");
		else {
			nfc.adapter = nfc.bus.getObject(nfc.busName, 
					props.Adapters[0], 
					onAdapterOk, 
					errorCB);
		}
	}
	
	function onManagerOk() {
		nfc.manager.GetProperties(onManagerPropsOk, errorCB);
	}
	
	function onConnectOk() {
		nfc.bus = cloudeebus.SystemBus();
		nfc.uri = uri;
		nfc.manager = nfc.bus.getObject(nfc.busName, "/", onManagerOk, errorCB);
	}
	
	cloudeebus.connect(uri, manifest, onConnectOk, errorCB);
};


nfc.getDefaultAdapter = function() {
	return nfc.defaultAdapter;
};

nfc.registerNdefAgent = function(tagType, log_func, successCB, errorCB) {
	var self = this;
	
	function ReleaseMethodHandler(methodId) {
		
		ndefAgent.returnMethod(methodId, 
				   success=true, 
				   result=null, 
				   successCB=null, 
				   errorCB=null);
	}

	function GetNDEFMethodHandler(methodId, args) {
		
		self.log(arguments.callee.name + ":" + args);
		
		ndefAgent.returnMethod(methodId, 
				   success=true, 
				   result=null, 
				   successCB=null, 
				   errorCB=null);
	}

	function agentAddSucessCB(agent) {		
		self.log(arguments.callee.name + ". Agent: '" + agent + "' added!");
		self.log(arguments.callee.name + "-> register method Release");
		self.ndefAgent.registerMethod("Release", ReleaseMethodHandler);
		self.log(arguments.callee.name + "-> register method GetNDEF");
		self.ndefAgent.registerMethod("GetNDEF", GetNDEFMethodHandler);
		if (successCB) {
			try { // NDEF object added successfully, invoking success callback of the main code (with ndefAgent instance).
				successCB(self.ndefAgent);
			}
			catch (e) {
				alert(arguments.callee.name + "-> Method callback exception: " + e);
			}
		}
	}

	function NdefServiceAddSuccessCB() {
		if (successCB) {
			try { // Adding NDEF object (interface & method) to the newly created service
				self.log(arguments.callee.name + "-> self.ndefAgent.addAgent()");
				self.ndefAgent.addAgent(agentAddSucessCB, errorCB);
			}
			catch (e) {
				alert(arguments.callee.name + "-> Method callback exception: " + e);
			}
		}
	}

	self.log = log_func;
	self.ndefAgent = new NDEFAgent(nfc.service, tagType);
	self.log(arguments.callee.name + "-> self.ndefAgent.addService()");
	self.ndefAgent.addService(NdefServiceAddSuccessCB, errorCB);		
};

nfc.unregisterNdefAgent = function(tagType, successCB, errorCB) {
	var self = this;
	
	function NDEFAgentRemoveSucessCB() {		
		self.log(arguments.callee.name);
	}

	self.ndefAgent.remove(NDEFAgentRemoveSucessCB, errorCB);		
};



/*****************************************************************************/

nfc.NFCAdapter = function(proxy) {
	this.proxy = proxy;
	if (proxy) {
		this.id = proxy.objectPath;
		this.powered = proxy.props.Powered ? true : false;
		this.polling = proxy.props.Polling ? true : false;
	}
	return this;
};


nfc.NFCAdapter.prototype.setPowered = function(state, successCB, errorCB) {

	var self = this;

	function onPoweredOk() {
		self.powered = state;
		if (successCB)
			successCB();
	}

	self.proxy.SetProperty("Powered", state, onPoweredOk, errorCB);
};


nfc.NFCAdapter.prototype.setPolling = function(state, successCB, errorCB) {

	var self = this;

	function onPollingOk() {
		self.polling = state;
		if (successCB)
			successCB();
	}

	if (state)
		self.proxy.StartPollLoop("Initiator", onPollingOk, errorCB);
	else
		self.proxy.StopPollLoop(onPollingOk, errorCB);
};


nfc.NFCAdapter.prototype.setTagListener = function(detectCB, errorCB, tagFilter) {
	
	var self = this;
	
	var tag = null;
	
	if (self.connected)
		self.unsetTagListener();
	
	function onTagPropsOk(props) {
		tag.props = props;
		tag.type = props.Type;
		if (detectCB)
			detectCB.onattach(tag);
	}
	
	function onTagFound(tagId) {
		if (tag) /* trigger "found" callback only once */
			return;
		tag = new nfc.NFCTag(nfc.bus.getObject(nfc.busName, tagId));
		tag.proxy.callMethod("org.neard.Tag", "GetProperties", 
				[], onTagPropsOk, errorCB);
	}
	
	function onPropertyChanged(key, table) {
		if (key == "Tags") {
			if (table.length == 0) {
				tag = null;
				detectCB.ondetach();
				self.setPolling(true);
			}
			else
				onTagFound(table[0]);
		}
	}
	
	self.proxy.connectToSignal("org.neard.Adapter","PropertyChanged",
			onPropertyChanged);
	self.connected = true;
};


nfc.NFCAdapter.prototype.unsetTagListener = function() {
	this.proxy.disconnectSignal("org.neard.Adapter","PropertyChanged");
	this.connected = false;
};



/*****************************************************************************/

nfc.NFCTag = function(proxy) {
	this.proxy = proxy;
	this.type = "GENERIC_TARGET";
	if (proxy) {
		this.id = proxy.objectPath;
	}
	return this;
};


nfc.NFCTag.prototype.readNDEF = function(readCB, errorCB) {
	
	var self = this;
	
	if (!self.props)
		return errorCB("Tag properties unknown.");
	
	var records = [];
	
	function onRecPropsOk(props) {
		records.push(nfc.NDEFRecordForProps(props));
		if (records.length == self.props.Records.length && readCB)
			readCB(new NDEFMessage(records));
	}
	
	for (var i=0; i<self.props.Records.length; i++) {
		var recProxy = nfc.bus.getObject(nfc.busName, self.props.Records[i]);
		recProxy.callMethod("org.neard.Record", "GetProperties", 
				[], onRecPropsOk, errorCB);
	}
};


nfc.NFCTag.prototype.writeNDEF = function(ndefMessage, successCB, errorCB) {
	var ndefRecord = ndefMessage.records[0];
	var rec = ndefRecord.neardRecord();
	this.proxy.callMethod("org.neard.Tag", "Write", 
			[rec], successCB, errorCB);
};



/*****************************************************************************/

nfc.NDEFMessage = function() {
	return this;
};


NDEFMessage = function(records) {
	nfc.NDEFMessage.call(this);
	this.records = records;
	return this;
};

NDEFMessage.prototype = new nfc.NDEFMessage();
NDEFMessage.prototype.constructor = NDEFMessage;



/*****************************************************************************/

nfc.NDEFRecord = function(props) {
	return this;
};


nfc.NDEFRecord.prototype.neardRecord = function() {
	return {};
};



/*****************************************************************************/

nfc.NDEFRecordText = function(props) {
	nfc.NDEFRecord.call(this,props);
	if (props) {
		this.text = props.Representation;
		this.languageCode = props.Language;
		this.encoding = props.Encoding;
	}
	return this;
};

nfc.NDEFRecordText.prototype = new nfc.NDEFRecord();
nfc.NDEFRecordText.prototype.constructor = nfc.NDEFRecordText;


nfc.NDEFRecordText.prototype.neardRecord = function() {
	return {
		Type: "Text",
		Representation: this.text,
		Language: this.languageCode,
		Encoding: this.encoding
	};
};


NDEFRecordText = function(text, languageCode, encoding) {
	nfc.NDEFRecordText.call(this);
	this.text = text;
	this.languageCode = languageCode ? languageCode : "en-US";
	this.encoding = encoding ? encoding : "UTF-8";
	return this;
};

NDEFRecordText.prototype = new nfc.NDEFRecordText();
NDEFRecordText.prototype.constructor = NDEFRecordText;



/*****************************************************************************/

nfc.NDEFRecordURI = function(props) {
	nfc.NDEFRecord.call(this,props);
	if (props) {
		this.uri = props.URI;
	}
	return this;
};

nfc.NDEFRecordURI.prototype = new nfc.NDEFRecord();
nfc.NDEFRecordURI.prototype.constructor = nfc.NDEFRecordURI;


nfc.NDEFRecordURI.prototype.neardRecord = function() {
	return {
		Type: "URI",
		URI: this.uri
	};
};


NDEFRecordURI = function(uri) {
	nfc.NDEFRecordURI.call(this);
	this.uri = uri;
	return this;
};

NDEFRecordURI.prototype = new nfc.NDEFRecordURI();
NDEFRecordURI.prototype.constructor = NDEFRecordURI;



/*****************************************************************************/

nfc.NDEFRecordForProps = function(props) {
	if (props.Type == "Text")
		return new nfc.NDEFRecordText(props);
	if (props.Type == "URI")
		return new nfc.NDEFRecordURI(props);
	return new nfc.NDEFRecord(props);
};


/*****************************************************************************/

nfc.NDEFAgent = function(service) {
	this.srvName = service;
	this.tagType = null;
	this.objectCreated = false;
	this.service = null;
	return this;
};


NDEFAgent = function(service, tagType, successCB, errorCB) {
	nfc.NDEFAgent.call(this, service);
	this.tagType = tagType;
	this.objectPath = tagType.replace(/:/g, "");
	this.objectPath = this.objectPath.toUpperCase();
	this.objectPath = "/CloudeebusNdefagent/" + this.objectPath;
	this.xmlTemplate = '<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"\n"http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">\n<node><interface name="org.neard.NDEFAgent"><method name="GetNDEF"><arg name="values" type="a{sv}" direction="in"/></method><method name="Release"></method></interface></node>';
};

nfc.NDEFAgent.prototype.addService = function(successCB, errorCB) {
	var self = this;
	
	function NDEFserviceAddSuccessCB(cloudeebusService) {
		self.service = cloudeebusService;
		if (successCB) {
			try { // calling dbus hook object function for un-translated types
				successCB(cloudeebusService);
			}
			catch (e) {
				alert(arguments.callee.name + "-> Method callback exception: " + e);
			}
		}
	}

	nfc.bus.addService(this.srvName, NDEFserviceAddSuccessCB, errorCB);
};

nfc.NDEFAgent.prototype.addAgent = function(successCB, errorCB) {
	this.service.addAgent(this.objectPath, this.xmlTemplate, successCB, errorCB);
};

nfc.NDEFAgent.prototype.registerMethod = function(methodName, methodHandler) {
	methodId = this.srvName + "#" + this.objectPath + "#" + methodName;
	
	this.service.registerMethod(methodId, methodHandler);
};

nfc.NDEFAgent.prototype.returnMethod = function(methodId, success, result, successCB, errorCB) {
	this.service.returnMethod(methodId, success, result, successCB, errorCB);
};

nfc.NDEFAgent.prototype.remove = function(successCB, errorCB) {
	var self = this;
	
	function delAgentSuccessCB(agent) {
		if (successCB) {
			try { // calling dbus hook object function for un-translated types
				successCB(agent);
			}
			catch (e) {
				alert(arguments.callee.name + "-> Method callback exception: " + e);
			}
		}
	}

	this.service.delAgent(this.objectPath, delAgentSuccessCB, errorCB);
};

NDEFAgent.prototype = new nfc.NDEFAgent();
NDEFAgent.prototype.constructor = NDEFAgent;

/*****************************************************************************/
	





