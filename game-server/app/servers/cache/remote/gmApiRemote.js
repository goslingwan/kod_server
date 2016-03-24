"use strict"

/**
 * Created by modun on 14-7-29.
 */

var _ = require("underscore")
var ShortId = require('shortid');
var Promise = require('bluebird');
var usage = require('usage');
var os = require('os');

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

	(function sendMail(){
		if(playerIds.length === 0) return callback();

		var playerId = playerIds.pop();
		var playerDoc = null;
		var playerData = [];
		var lockPairs = [];
		self.cacheService.findPlayerAsync(playerId).then(function(doc){
			playerDoc = doc;

			lockPairs.push({key:Consts.Pairs.Player, value:playerDoc._id});
			return self.cacheService.lockAllAsync(lockPairs, true);
		}).then(function(){
			while(playerDoc.mails.length >= Define.PlayerMailsMaxSize){
				(function(){
					var willRemovedMail = LogicUtils.getPlayerFirstUnSavedMail(playerDoc)
					playerData.push(["mails." + playerDoc.mails.indexOf(willRemovedMail), null])
					LogicUtils.removeItemInArray(playerDoc.mails, willRemovedMail)
				})();
			}
			playerDoc.mails.push(mail)
			playerData.push(["mails." + playerDoc.mails.indexOf(mail), mail])
		}).then(function(){
			return self.cacheService.touchAllAsync(lockPairs);
		}).then(function(){
			return self.cacheService.unlockAllAsync(lockPairs);
		}).then(function(){
			return self.pushService.onPlayerDataChangedAsync(playerDoc, playerData)
		}).catch(function(e){
			self.logService.onError('cache.gmApiRemote.SendInCacheServerMail', {
				playerId:playerId,
				title:title,
				content:content,
				rewards:rewards
			}, e.stack);
			if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
		}).finally(function(){
			setImmediate(sendMail);
		})
	})();
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
		if(_.isObject(e)){
			self.logService.onError('cache.gmApiRemote.SendOutCacheServerMail', {
				playerIds:playerIds,
				title:title,
				content:content,
				rewards:rewards
			}, e.stack);
		}
		callback()
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
	callback(null, {code:200, data:null});

	var self = this
	var lastLoginTime = Date.now() - (DataUtils.getPlayerIntInit('activePlayerNeedHouses') * 60 * 60 * 1000);
	var inCacheIds = [];
	var outCacheIds = [];
	var sendOutCacheServerMailAsync = Promise.promisify(SendOutCacheServerMail, {context:self});
	var sendInCacheServerMailAsync = Promise.promisify(SendInCacheServerMail, {context:self});
	Promise.fromCallback(function(callback){
		self.Player.collection.find({
			serverId:self.cacheServerId,
			'countInfo.lastLogoutTime':{$gt:lastLoginTime}
		}, {_id:true}).toArray(callback);
	}).then(function(docs){
		_.each(docs, function(doc){
			var id = doc._id;
			if(self.cacheService.isPlayerInCache(id)) inCacheIds.push(id);
			else outCacheIds.push(id);
		})
		return sendOutCacheServerMailAsync(outCacheIds, title, content, rewards)
	}).then(function(){
		return sendInCacheServerMailAsync(inCacheIds, title, content, rewards)
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.sendGlobalMail', {
			playerCount:docs.length,
			title:title,
			content:content,
			rewards:rewards
		}, e.stack);
	})
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
	callback(null, {code:200, data:null});

	var self = this;
	var inCacheIds = [];
	var outCacheIds = [];
	_.each(ids, function(id){
		if(self.cacheService.isPlayerInCache(id)) inCacheIds.push(id);
		else outCacheIds.push(id);
	})
	var sendOutCacheServerMailAsync = Promise.promisify(SendOutCacheServerMail, {context:this});
	var sendInCacheServerMailAsync = Promise.promisify(SendInCacheServerMail, {context:this});
	sendOutCacheServerMailAsync(outCacheIds, title, content, rewards).then(function(){
		return sendInCacheServerMailAsync(inCacheIds, title, content, rewards)
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.sendMailToPlayers', {
			count:ids.length,
			title:title,
			content:content,
			rewards:rewards
		}, e.stack);
	})
}

/**
 * 根据ID查找玩家
 * @param id
 * @param callback
 */
pro.findPlayerById = function(id, callback){
	var self = this;
	this.logService.onRemote('cache.gmApiRemote.findPlayerById', {id:id});
	this.cacheService.findPlayerAsync(id).then(function(doc){
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
	this.cacheService.findAllianceAsync(id).then(function(doc){
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
	var lockPairs = [];
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		if(!_.isObject(playerDoc)) return Promise.reject(ErrorUtils.playerNotExist(playerId, playerId));

		lockPairs.push({key:Consts.Pairs.Player, value:playerDoc._id});
		return self.cacheService.lockAllAsync(lockPairs, true);
	}).then(function(){
		playerDoc.countInfo.lockTime = time;
	}).then(function(){
		return self.cacheService.touchAllAsync(lockPairs);
	}).then(function(){
		return self.cacheService.unlockAllAsync(lockPairs);
	}).then(function(){
		callback(null, {code:200, data:null});
	}).then(
		function(){
			if(!!playerDoc.logicServerId && time > 0){
				self.app.rpc.logic.logicRemote.kickPlayer.toServer(playerDoc.logicServerId, playerDoc._id, "禁止登录");
			}
		},
		function(e){
			self.logService.onError('cache.gmApiRemote.banPlayer', {
				playerId:playerId,
				time:time
			}, e.stack);
			if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
			callback(null, {code:500, data:e.message});
		}
	)
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
	var lockPairs = [];
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		if(!_.isObject(playerDoc)) return Promise.reject(ErrorUtils.playerNotExist(playerId, playerId));

		lockPairs.push({key:Consts.Pairs.Player, value:playerDoc._id});
		return self.cacheService.lockAllAsync(lockPairs, true);
	}).then(function(){
		playerDoc.countInfo.muteTime = time;
		playerData.push(['countInfo.muteTime', time]);
	}).then(function(){
		return self.cacheService.touchAllAsync(lockPairs);
	}).then(function(){
		return self.cacheService.unlockAllAsync(lockPairs);
	}).then(function(){
		return self.pushService.onPlayerDataChangedAsync(playerDoc, playerData)
	}).then(function(){
		callback(null, {code:200, data:null});
	}).catch(function(e){
		self.logService.onError('cache.gmApiRemote.mutePlayer', {
			playerId:playerId,
			time:time
		}, e.stack);
		if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
		callback(null, {code:500, data:e.message});
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
	var memoryTotal = (os.totalmem() / (1024 * 1024)).toFixed(2);
	var memoryUsage = process.memoryUsage();
	var heapUsed = (memoryUsage.heapUsed / (1024 * 1024)).toFixed(2);
	var rss = (memoryUsage.rss / (1024 * 1024)).toFixed(2);
	var heapTotal = (memoryUsage.heapTotal / (1024 * 1024)).toFixed(2);
	var uptime = (process.uptime() / 60).toFixed(2);
	info.sysInfo = {
		memoryTotal:memoryTotal,
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
		'countInfo.lastLogoutTime':{$gt:Date.now() - (24 * 60 * 60 * 1000)}
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