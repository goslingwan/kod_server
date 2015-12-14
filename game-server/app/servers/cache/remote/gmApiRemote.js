"use strict"

/**
 * Created by modun on 14-7-29.
 */

var _ = require("underscore")
var ShortId = require('shortid');
var Promise = require('bluebird');
var usage = require('usage');

var DataUtils = require("../../../utils/dataUtils")
var ErrorUtils = require("../../../utils/errorUtils")
var LogicUtils = require('../../../utils/logicUtils')
var Consts = require("../../../consts/consts")
var Define = require("../../../consts/define")

module.exports = function(app){
	return new CacheRemote(app)
}

var CacheRemote = function(app){
	this.app = app
	this.logService = app.get('logService');
	this.channelService = app.get('channelService')
	this.cacheService = app.get('cacheService');
	this.pushService = app.get('pushService');
	this.dataService = app.get('dataService');
	this.Player = app.get('Player');
	this.Alliance = app.get('Alliance');
	this.cacheServerId = app.getCurServer().id;
}

var pro = CacheRemote.prototype

/**
 * 给在线玩家发全服邮件
 * @param playerIds
 * @param title
 * @param content
 * @param rewards
 * @param callback
 */
var SendInCacheServerMail = function(playerIds, title, content, rewards, callback){
	var self = this;
	var mail = {
		id:ShortId.generate(),
		title:title,
		fromId:"__system",
		fromName:"__system",
		fromIcon:0,
		fromAllianceTag:"",
		sendTime:Date.now(),
		content:content,
		rewards:rewards,
		rewardGetted:false,
		isRead:false,
		isSaved:false
	};

	setImmediate(function(){
		if(playerIds.length > 0){
			var playerId = playerIds.shift();
			var playerDoc = null;
			var playerData = [];
			return self.cacheService.findPlayerAsync(playerId).then(function(doc){
				playerDoc = doc;
				if(!_.isObject(playerDoc)) return Promise.reject(ErrorUtils.playerNotExist(playerId, playerId));
				while(playerDoc.mails.length >= Define.PlayerMailsMaxSize){
					(function(){
						var willRemovedMail = LogicUtils.getPlayerFirstUnSavedMail(playerDoc)
						playerData.push(["mails." + playerDoc.mails.indexOf(willRemovedMail), null])
						LogicUtils.removeItemInArray(playerDoc.mails, willRemovedMail)
					})();
				}
				playerDoc.mails.push(mail)
				playerData.push(["mails." + playerDoc.mails.indexOf(mail), mail])
				return self.cacheService.updatePlayerAsync(playerId, playerDoc)
			}).then(function(){
				return self.pushService.onPlayerDataChangedAsync(playerDoc, playerData)
			}).then(function(){
				return SendInCacheServerMail.call(self, playerIds, title, content, rewards, callback);
			}).catch(function(e){
				self.logService.onError('cache.gmApiRemote.SendInCacheServerMail', {
					playerId:playerId,
					title:title,
					content:content
				}, e.stack);
				var funcs = []
				if(_.isObject(playerDoc)){
					funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
				}
				return Promise.all(funcs).then(function(){
					return SendInCacheServerMail.call(self, playerIds, title, content, rewards, callback);
				})
			})
		}else{
			callback();
		}
	})
}

/**
 * 给离线玩家发送全服邮件
 * @param playerIds
 * @param title
 * @param content
 * @param rewards
 * @param callback
 */
var SendOutCacheServerMail = function(playerIds, title, content, rewards, callback){
	var self = this;
	var mail = {
		id:ShortId.generate(),
		title:title,
		fromId:"__system",
		fromName:"__system",
		fromIcon:0,
		fromAllianceTag:"",
		sendTime:Date.now(),
		content:content,
		rewards:rewards,
		rewardGetted:false,
		isRead:false,
		isSaved:false
	};

	this.Player.collection.update({
		serverId:self.cacheServerId,
		_id:{$in:playerIds}
	}, {$push:{mails:mail}}, {multi:true}, function(e){
		if(_.isObject(e)) callback(e);
		else callback()
	});
}

/**
 * 发送全服系统邮件
 * @param title
 * @param content
 * @param rewards
 * @param callback
 */
pro.sendGlobalMail = function(title, content, rewards, callback){
	this.logService.onRemote('cache.gmApiRemote.sendGlobalMail', {title:title, content:content, rewards:rewards});

	var self = this
	var lastLoginTime = Date.now() - (DataUtils.getPlayerIntInit('activePlayerNeedHouses') * 60 * 60 * 1000);
	this.Player.collection.find({
		serverId:self.cacheServerId,
		'countInfo.lastLogoutTime':{$gt:lastLoginTime}
	}, {
		_id:true
	}).toArray(function(e, docs){
		var inCacheIds = [];
		var outCacheIds = [];
		_.each(docs, function(doc){
			var id = doc._id;
			if(self.cacheService.isPlayerInCache(id)) inCacheIds.push(id);
			else outCacheIds.push(id);
		})
		var SendOutCacheServerMailAsync = Promise.promisify(SendOutCacheServerMail, {context:self});
		var SendInCacheServerMailAsync = Promise.promisify(SendInCacheServerMail, {context:self});
		SendOutCacheServerMailAsync(outCacheIds, title, content, rewards).then(function(){
			self.logService.onRemote('cache.gmApiRemote.sendGlobalMail.SendOutCacheServerMail', {
				playerCount:outCacheIds.length,
				title:title,
				content:content,
				rewards:rewards
			});
			return SendInCacheServerMailAsync(inCacheIds, title, content, rewards)
		}).then(function(){
			self.logService.onRemote('cache.gmApiRemote.sendGlobalMail.SendInCacheServerMail', {
				playerCount:inCacheIds.length,
				title:title,
				content:content,
				rewards:rewards
			});
		}).catch(function(e){
			self.logService.onError('cache.gmApiRemote.sendGlobalMail', {
				playerCount:docs.length,
				title:title,
				content:content,
				rewards:rewards
			}, e.stack);
		})
	})

	callback(null, {code:200, data:null});
}

/**
 * 向指定玩家发送系统邮件
 * @param ids
 * @param title
 * @param content
 * @param rewards
 * @param callback
 */
pro.sendMailToPlayers = function(ids, title, content, rewards, callback){
	this.logService.onRemote('cache.gmApiRemote.sendMailToPlayers', {
		ids:ids,
		title:title,
		content:content,
		rewards:rewards
	});

	var self = this;
	var inCacheIds = [];
	var outCacheIds = [];
	_.each(ids, function(id){
		if(self.cacheService.isPlayerInCache(id)) inCacheIds.push(id);
		else outCacheIds.push(id);
	})
	var SendOutCacheServerMailAsync = Promise.promisify(SendOutCacheServerMail, {context:this});
	var SendInCacheServerMailAsync = Promise.promisify(SendInCacheServerMail, {context:this});
	SendOutCacheServerMailAsync(outCacheIds, title, content, rewards).then(function(){
		self.logService.onRemote('cache.gmApiRemote.sendMailToPlayers.SendOutCacheServerMail', {
			playerCount:outCacheIds.length,
			title:title,
			content:content,
			rewards:rewards
		});
		return SendInCacheServerMailAsync(inCacheIds, title, content, rewards)
	}).then(function(){
		self.logService.onRemote('cache.gmApiRemote.sendMailToPlayers.SendInCacheServerMail', {
			playerCount:inCacheIds.length,
			title:title,
			content:content,
			rewards:rewards
		});
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.sendMailToPlayers', {
			count:ids.length,
			title:title,
			content:content,
			rewards:rewards
		}, e.stack);
	})

	callback(null, {code:200, data:null});
}

/**
 * 根据ID查找玩家
 * @param id
 * @param callback
 */
pro.findPlayerById = function(id, callback){
	var self = this;
	this.logService.onRemote('cache.gmApiRemote.findPlayerById', {id:id});
	this.cacheService.directFindPlayerAsync(id).then(function(doc){
		callback(null, {code:200, data:doc});
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.findPlayerById', {
			id:id
		}, e.stack);
		callback(null, {code:500, data:e.message});
	})
}

/**
 * 根据ID查找联盟
 * @param id
 * @param callback
 */
pro.findAllianceById = function(id, callback){
	var self = this;
	this.logService.onRemote('cache.gmApiRemote.findAllianceById', {id:id});
	this.cacheService.directFindAllianceAsync(id).then(function(doc){
		callback(null, {code:200, data:doc});
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.findAllianceById', {
			id:id
		}, e.stack);
		callback(null, {code:500, data:e.message});
	})
}

/**
 * 禁止玩家登陆
 * @param playerId
 * @param time
 * @param callback
 */
pro.banPlayer = function(playerId, time, callback){
	this.logService.onRemote('cache.gmApiRemote.banPlayer', {playerId:playerId, time:time});
	var self = this;
	var playerDoc = null;
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		if(!_.isObject(playerDoc)) return Promise.reject(ErrorUtils.playerNotExist(playerId, playerId));
		playerDoc.countInfo.lockTime = time;
		return self.cacheService.updatePlayerAsync(playerId, playerDoc)
	}).then(function(){
		if(!!playerDoc.logicServerId && time > 0){
			self.app.rpc.logic.logicRemote.kickPlayer.toServer(playerDoc.logicServerId, playerDoc._id, "禁止登录");
		}
		callback(null, {code:200, data:null});
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.banPlayer', {
			playerId:playerId,
			time:time
		}, e.stack);
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(null, {code:500, data:e.message});
		})
	})
}

/**
 * 禁言玩家
 * @param playerId
 * @param time
 * @param callback
 */
pro.mutePlayer = function(playerId, time, callback){
	this.logService.onRemote('cache.gmApiRemote.mutePlayer', {playerId:playerId, time:time});
	var self = this;
	var playerDoc = null;
	var playerData = [];
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		if(!_.isObject(playerDoc)) return Promise.reject(ErrorUtils.playerNotExist(playerId, playerId));
		playerDoc.countInfo.muteTime = time;
		playerData.push(['countInfo.muteTime', time]);
		return self.cacheService.updatePlayerAsync(playerId, playerDoc);
	}).then(function(){
		return self.dataService.updatePlayerSessionAsync(playerDoc, {muteTime:time});
	}).then(function(){
		return self.pushService.onPlayerDataChangedAsync(playerDoc, playerData)
	}).then(function(){
		callback(null, {code:200, data:null});
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.mutePlayer', {
			playerId:playerId,
			time:time
		}, e.stack);
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(null, {code:500, data:e.message});
		})
	})
}

/**
 * 获取
 * @param callback
 */
pro.getServerInfo = function(callback){
	this.logService.onRemote('cache.cacheRemote.getServerInfo');

	var self = this;
	var info = {}
	var memoryUsage = process.memoryUsage();
	var heapUsed = (memoryUsage.heapUsed / (1024 * 1024)).toFixed(2);
	var rss = (memoryUsage.rss / (1024 * 1024)).toFixed(2);
	var heapTotal = (memoryUsage.heapTotal / (1024 * 1024)).toFixed(2);
	var uptime = (process.uptime() / 60).toFixed(2);
	info.sysInfo = {
		heapTotal:heapTotal,
		heapUsed:heapUsed,
		rss:rss,
		uptime:uptime
	}
	info.gameInfo = {
		onlineCount:self.app.get('onlineCount')
	}
	this.cacheService.getPlayerModel().countAsync({
		serverId:this.cacheServerId,
		lastActiveTime:{$gt:Date.now() - (24 * 60 * 60 * 1000)}
	}).then(function(activeCount){
		info.gameInfo.activeCount = activeCount
		return self.cacheService.getPlayerModel().countAsync({serverId:self.cacheServerId})
	}).then(function(totalCount){
		info.gameInfo.totalCount = totalCount;
		return Promise.fromCallback(function(callback){
			usage.lookup(process.pid, function(e, res){
				callback(null, !!e ? 0 : res.cpu);
			})
		})
	}).then(function(cpu){
		info.sysInfo.cpu = cpu.toFixed(2);
		return Promise.resolve();
	}).then(function(){
		callback(null, {code:200, data:info});
	}).catch(function(e){
		self.logService.onError('cache.cacheRemote.getServerInfo', {}, e.stack);
		callback(null, {code:200, data:info});
	})
}