"use strict"

/**
 * Created by modun on 15/4/16.
 */

var routeUtil = module.exports

routeUtil.chat = function(session, msg, app, callback){
	if(!session.get("chatServerId")){
		callback(new Error("fail to find chatServerId in session"))
		return
	}
	callback(null, session.get("chatServerId"))
}

routeUtil.logic = function(session, msg, app, callback){
	if(!session.get("logicServerId")){
		callback(new Error("fail to find logicServerId in session"))
		return
	}
	callback(null, session.get("logicServerId"))
}