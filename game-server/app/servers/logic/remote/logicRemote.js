"use strict"

/**
 * Created by modun on 14-7-29.
 */

var Promise = require("bluebird")
var _ = require("underscore")
var Consts = require("../../../consts/consts")

module.exports = function(app) {
	return new LogicRemote(app)
}

var LogicRemote = function(app) {
	this.app = app
	this.playerTimeEventService = app.get("playerTimeEventService")
	this.allianceTimeEventService = app.get("allianceTimeEventService")
	this.sessionService = app.get("sessionService")
	this.logService = app.get("logService")
	this.channelService = app.get("channelService")
}
var pro = LogicRemote.prototype

/**
 * 将玩家踢下线
 * @param uid
 * @param reason
 * @param callback
 */
pro.kickPlayer = function(uid, reason, callback){
	this.logService.onRequest("logic.logicRemote.kickPlayer", {playerId:uid, reason:reason})
	this.sessionService.kick(uid, reason, callback)
}

/**
 * 执行时间回调
 * @param key
 * @param eventType
 * @param eventId
 * @param callback
 */
pro.onTimeEvent = function(key, eventType, eventId, callback){
	this.logService.onEvent("logic.logicRemote.onTimeEvent", {key:key, eventType:eventType, eventId:eventId})
	var params = key.split(":")
	var targetType = params[0]
	var id = params[1]
	if(_.isEqual(Consts.TimeEventType.Player, targetType)){
		this.playerTimeEventService.onTimeEvent(id, eventType, eventId, callback)
	}else if(_.isEqual(Consts.TimeEventType.Alliance, targetType)){
		this.allianceTimeEventService.onTimeEvent(id, eventType, eventId, callback)
	}else if(_.isEqual(Consts.TimeEventType.AllianceFight, targetType)){
		var ids = eventId.split(":")
		this.allianceTimeEventService.onFightTimeEvent(ids[0], ids[1], callback)
	}else{
		callback(new Error("未知的事件类型"))
	}
}

/**
 * 设置服务器状态
 * @param status
 * @param callback
 */
pro.setServerStatus = function(status, callback){
	this.logService.onEvent("logic.logicRemote.setServerStatus", {status:status})
	this.app.set("isReady", status)
	callback()
}

/**
 * 获取在线玩家数量
 * @param callback
 */
pro.getOnlineUser = function(callback){
	var connectionService = this.app.components.__connection__
	var statisticsInfo = connectionService.getStatisticsInfo()
	callback(null, statisticsInfo.loginedCount)
}

/**
 * 将玩家添加到联盟频道
 * @param allianceId
 * @param uid
 * @param logicServerId
 * @param callback
 */
pro.addToAllianceChannel = function(allianceId, uid, logicServerId , callback){
	this.channelService.getChannel(Consts.AllianceChannelPrefix + "_" + allianceId, true).add(uid, logicServerId)
	callback()
}

/**
 * 将玩家从联盟频道移除
 * @param uid
 * @param logicServerId
 * @param allianceId
 * @param callback
 */
pro.removeFromAllianceChannel = function(uid, logicServerId, allianceId, callback){
	var channel = this.channelService.getChannel(Consts.AllianceChannelPrefix + "_" + allianceId)
	channel.leave(uid, logicServerId)
	if(channel.getMembers.length == 0) channel.destroy()

	callback()
}