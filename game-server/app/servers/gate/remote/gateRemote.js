"use strict"

/**
 * Created by modun on 14/10/28.
 */

module.exports = function(app) {
	return new GateRemote(app)
}

var GateRemote = function(app) {
	this.app = app
	this.logService = app.get("logService")
	this.gateService = app.get("gateService")
}
var pro = GateRemote.prototype

/**
 * 获取推荐的服务器
 * @returns {*}
 */
pro.getPromotedServer = function(callback){
	callback(null, this.gateService.getPromotedServer())
}

/**
 * 获取服务器列表
 * @param callback
 */
pro.getServers = function(callback){
	this.gateService.getServersAsync().then(function(servers){
		callback(null, servers)
	})
}