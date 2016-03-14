"use strict"

/**
 * Created by modun on 15/2/1.
 */

var ShortId = require("shortid")
var request = require('request')
var Promise = require("bluebird")
var _ = require("underscore")
var DOMParser = require('xmldom').DOMParser;
var SignedXml = require('xml-crypto').SignedXml
	, FileKeyInfo = require('xml-crypto').FileKeyInfo
	, select = require('xml-crypto').xpath
var IABVerifier = require('iab_verifier')

var LogicUtils = require("../utils/logicUtils")
var ErrorUtils = require("../utils/errorUtils")
var Consts = require("../consts/consts")
var Define = require("../consts/define")

var GameDatas = require("../datas/GameDatas")
var StoreItems = GameDatas.StoreItems

var PlayerIAPService = function(app){
	this.app = app
	this.env = app.get("env")
	this.logService = app.get("logService")
	this.pushService = app.get("pushService")
	this.cacheService = app.get('cacheService');
	this.dataService = app.get('dataService');
	this.Billing = app.get("Billing")
	this.GemChange = app.get("GemChange")
	this.platform = app.get('serverConfig').platform;
	this.platformParams = app.get('serverConfig')[this.platform];
}

module.exports = PlayerIAPService
var pro = PlayerIAPService.prototype


/**
 21000
 The App Store could not read the JSON object you provided.
 21002
 The data in the receipt-data property was malformed or missing.
 21003
 The receipt could not be authenticated.
 21004
 The shared secret you provided does not match the shared secret on file for your account.
 Only returned for iOS 6 style transaction receipts for auto-renewable subscriptions.
 21005
 The receipt server is not currently available.
 21006
 This receipt is valid but the subscription has expired. When this status code is returned to your server, the receipt data is also decoded and returned as part of the response.
 Only returned for iOS 6 style transaction receipts for auto-renewable subscriptions.
 21007
 This receipt is from the test environment, but it was sent to the production environment for verification. Send it to the test environment instead.
 21008
 This receipt is from the production environment, but it was sent to the test environment for verification. Send it to the production environment instead.
 */

/**
 * 去苹果商店验证
 * @param playerDoc
 * @param receiptData
 * @param callback
 */
var IosBillingValidate = function(playerDoc, receiptData, callback){
	var self = this;
	var body = {
		"receipt-data":new Buffer(receiptData).toString("base64")
	}
	request.post(this.platformParams.iapValidateUrl, {form:JSON.stringify(body)}, function(e, resp, body){
		if(!!e){
			e = new Error("请求苹果验证服务器网络错误,错误信息:" + e.message);
			self.logService.onError('cache.playerIAPService.IosBillingValidate', null, e.stack);
			return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
		}
		if(resp.statusCode != 200){
			e = new Error("服务器未返回正确的状态码:" + resp.statusCode);
			self.logService.onError('cache.playerIAPService.IosBillingValidate', {statusCode:resp.statusCode}, e.stack);
			return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
		}
		try{
			var jsonObj = JSON.parse(body)
		}catch(e){
			e = new Error("解析苹果返回的json信息出错,错误信息:" + e.message);
			self.logService.onError('cache.playerIAPService.IosBillingValidate', {body:body}, e.stack);
			return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
		}
		if(jsonObj.status == 0){
			callback(null, jsonObj.receipt)
		}else if(jsonObj.status == 21005){
			e = new Error("苹果验证服务器不可用");
			self.logService.onError('cache.playerIAPService.IosBillingValidate', {jsonObj:jsonObj}, e.stack);
			callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message))
		}else{
			callback(ErrorUtils.iapValidateFaild(playerDoc._id, jsonObj))
		}
	})
}

/**
 * Wp官方商店验证
 * @param playerDoc
 * @param receiptData
 * @param callback
 */
var WpOfficialBillingValidate = function(playerDoc, receiptData, callback){
	var doc = new DOMParser().parseFromString(receiptData);
	var signature = select(doc, "/*/*[local-name(.)='Signature' and namespace-uri(.)='http://www.w3.org/2000/09/xmldsig#']")[0];
	var e = null;
	if(!signature){
		e = new Error("错误的receiptData");
		this.logService.onError('cache.playerIAPService.WpOfficialBillingValidate', {receiptData:receiptData}, e.stack);
		return callback(ErrorUtils.iapValidateFaild(playerDoc._id));
	}
	var sig = new SignedXml();
	sig.keyInfoProvider = new FileKeyInfo(this.app.getBase() + '/config/' + this.platformParams.officialIapValidateCert);
	sig.loadSignature(signature.toString());
	var res = sig.checkSignature(receiptData);
	if(!res)return callback(ErrorUtils.iapValidateFaild(playerDoc._id, sig.validationErrors));
	var receipt = doc.getElementsByTagName('Receipt')[0];
	var productReceipt = receipt.getElementsByTagName('ProductReceipt')[0];
	var productId = productReceipt.getAttribute('ProductId');
	var transactionId = productReceipt.getAttribute('Id');
	callback(null, {
		transactionId:transactionId,
		productId:productId,
		quantity:1
	})
}

/**
 * Wp Adeasygo 订单验证
 * @param playerDoc
 * @param uid
 * @param transactionId
 * @param callback
 */
var WpAdeasygoBillingValidate = function(playerDoc, uid, transactionId, callback){
	var self = this;
	var form = {
		uid:uid,
		trade_no:transactionId,
		show_detail:1
	}
	request.post(self.platformParams.adeasygoIapValidateUrl, {form:form}, function(e, resp, body){
		if(!!e){
			e = new Error("请求Adeasygo验证服务器网络错误,错误信息:" + e.message);
			self.logService.onError('cache.playerIAPService.WpAdeasygoBillingValidate', null, e.stack);
			return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
		}
		if(resp.statusCode != 200){
			e = new Error("服务器未返回正确的状态码:" + resp.statusCode);
			self.logService.onError('cache.playerIAPService.WpAdeasygoBillingValidate', {statusCode:resp.statusCode}, e.stack);
			return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
		}
		try{
			var jsonObj = JSON.parse(body)
		}catch(e){
			e = new Error("解析Adeasygo返回的json信息出错,错误信息:" + e.message);
			self.logService.onError('cache.playerIAPService.WpAdeasygoBillingValidate', {body:body}, e.stack);
			return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
		}
		if(jsonObj.code !== 1 || !jsonObj.trade_detail || jsonObj.trade_detail.app_id !== self.platformParams.adeasygoAppId){
			return callback(ErrorUtils.iapValidateFaild(playerDoc._id, jsonObj))
		}
		var productId = jsonObj.trade_detail.out_goods_id;
		var itemConfig = _.find(StoreItems.items, function(item){
			if(_.isObject(item)){
				return item.productId === productId
			}
		})
		if(!itemConfig){
			return callback(ErrorUtils.iapProductNotExist(playerId, productId));
		}


		var tryTimes = 0;
		var maxTryTimes = 5;
		(function finishTransaction(){
			tryTimes++;
			var form = {
				trade_no:transactionId
			}
			request.post(self.platformParams.adeasygoIapStatusUpdateUrl, {form:form}, function(e, resp, body){
				if(!!e){
					e = new Error("请求Adeasygo更新订单状态出错,错误信息:" + e.message);
					self.logService.onError('cache.playerIAPService.WpAdeasygoBillingValidate', null, e.stack);
					if(tryTimes < maxTryTimes){
						return setTimeout(finishTransaction, 500);
					}else{
						return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message))
					}
				}
				if(resp.statusCode != 200){
					e = new Error("服务器未返回正确的状态码:" + resp.statusCode);
					self.logService.onError('cache.playerIAPService.WpAdeasygoBillingValidate', {statusCode:resp.statusCode}, e.stack);
					if(tryTimes < maxTryTimes){
						return setTimeout(finishTransaction, 500);
					}else{
						return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
					}
				}
				try{
					var jsonObj = JSON.parse(body)
				}catch(e){
					e = new Error("解析Adeasygo返回的json信息出错,错误信息:" + e.message);
					self.logService.onError('cache.playerIAPService.WpAdeasygoBillingValidate', {body:body}, e.stack);
					if(tryTimes < maxTryTimes){
						return setTimeout(finishTransaction, 500);
					}else{
						return callback(ErrorUtils.netErrorWithIapServer(playerDoc._id, e.message));
					}
				}
				if(jsonObj.code !== 1){
					if(tryTimes < maxTryTimes){
						return setTimeout(finishTransaction, 500);
					}else{
						return callback(ErrorUtils.iapValidateFaild(playerDoc._id, jsonObj))
					}
				}else{
					callback(null, {
						transactionId:transactionId,
						productId:productId,
						quantity:1
					})
				}
			})
		})();
	})
}

/**
 * Android官方商店验证
 * @param playerDoc
 * @param receiptData
 * @param receiptSignature
 * @param callback
 */
var AndroidOfficialBillingValidate = function(playerDoc, receiptData, receiptSignature, callback){
	var googleplayVerifier = new IABVerifier(this.platformParams.pubkey);
	var isValid = googleplayVerifier.verifyReceipt(receiptData, receiptSignature);
	if(!isValid){
		var e = new Error("错误的receiptData或receiptSignature");
		this.logService.onError('cache.playerIAPService.AndroidOfficialBillingValidate', {
			receiptData:receiptData,
			receiptSignature:receiptSignature
		}, e.stack);
		return callback(ErrorUtils.iapValidateFaild(playerDoc._id));
	}

	var jsonObj = JSON.parse(receiptData);
	callback(null, {
		transactionId:jsonObj.orderId,
		productId:jsonObj.productId,
		quantity:1
	})
}

/**
 * 创建订单记录
 * @param playerId
 * @param playerName
 * @param type
 * @param transactionId
 * @param productId
 * @param quantity
 * @param price
 * @returns {*}
 */
var CreateBillingItem = function(playerId, playerName, type, transactionId, productId, quantity, price){
	var billing = {
		type:type,
		playerId:playerId,
		playerName:playerName,
		transactionId:transactionId,
		productId:productId,
		quantity:quantity,
		price:quantity * price
	}
	return billing
}

/**
 * 获取商品道具奖励
 * @param config
 * @returns {{rewardsToMe: Array, rewardToAllianceMember: *}}
 * @constructor
 */
var GetStoreItemRewardsFromConfig = function(config){
	var rewardsToMe = []
	var rewardToAllianceMember = null
	var configArray_1 = config.rewards.split(",")
	_.each(configArray_1, function(config){
		var rewardArray = config.split(":")
		var reward = {
			type:rewardArray[0],
			name:rewardArray[1],
			count:parseInt(rewardArray[2])
		}
		rewardsToMe.push(reward)
	})
	if(!_.isEmpty(config.allianceRewards)){
		var rewardArray = config.allianceRewards.split(":")
		rewardToAllianceMember = {
			type:rewardArray[0],
			name:rewardArray[1],
			count:parseInt(rewardArray[2])
		}
	}

	return {rewardsToMe:rewardsToMe, rewardToAllianceMember:rewardToAllianceMember}
}

var SendAllianceMembersRewardsAsync = function(senderId, senderName, memberId, reward){
	var self = this
	var memberDoc = null
	var memberData = []
	var lockPairs = [];
	this.cacheService.findPlayerAsync(memberId).then(function(doc){
		memberDoc = doc
		lockPairs.push({type:Consts.Pairs.Player, value:memberDoc._id});
		return self.cacheService.lockAllAsync(lockPairs, true);
	}).then(function(){
		var iapGift = {
			id:ShortId.generate(),
			from:senderName,
			name:reward.name,
			count:reward.count,
			time:Date.now()
		}
		if(memberDoc.iapGifts.length >= Define.PlayerIapGiftsMaxSize){
			var giftToRemove = memberDoc.iapGifts[0]
			memberData.push(["iapGifts." + memberDoc.iapGifts.indexOf(giftToRemove), null])
			LogicUtils.removeItemInArray(memberDoc.iapGifts, giftToRemove)
		}
		memberDoc.iapGifts.push(iapGift)
		memberData.push(["iapGifts." + memberDoc.iapGifts.indexOf(iapGift), iapGift])
	}).then(function(){
		return self.cacheService.touchAllAsync(lockPairs);
	}).then(function(){
		return self.cacheService.unlockAllAsync(lockPairs);
	}).then(function(){
		return self.pushService.onPlayerDataChangedAsync(memberDoc, memberData)
	}).catch(function(e){
		self.logService.onError("logic.playerIAPService.SendAllianceMembersRewardsAsync", {
			senderId:senderId,
			memberId:memberId,
			reward:reward
		}, e.stack)
		if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
		return Promise.resolve();
	})
}

/**
 * 上传IosIAP信息
 * @param playerId
 * @param productId
 * @param transactionId
 * @param receiptData
 * @param callback
 */
pro.addIosPlayerBillingData = function(playerId, productId, transactionId, receiptData, callback){
	var self = this
	var playerDoc = null
	var allianceDoc = null
	var billing = null
	var playerData = []
	var lockPairs = [];
	var updateFuncs = [];
	var eventFuncs = [];
	var rewards = null

	var itemConfig = _.find(StoreItems.items, function(item){
		if(_.isObject(item)){
			return _.isEqual(item.productId, productId)
		}
	})
	if(!_.isObject(itemConfig))
		return callback(ErrorUtils.iapProductNotExist(playerId, productId));

	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		return self.Billing.findOneAsync({transactionId:transactionId})
	}).then(function(doc){
		if(!!doc) return Promise.reject(ErrorUtils.duplicateIAPTransactionId(playerId, transactionId))
		var billingValidateAsync = Promise.promisify(IosBillingValidate, {context:self})
		return billingValidateAsync(playerDoc, receiptData)
	}).then(function(respData){
		lockPairs.push({type:Consts.Pairs.Player, value:playerDoc._id});
		return self.cacheService.lockAllAsync(lockPairs, true).then(function(){
			billing = CreateBillingItem(playerId, playerDoc.basicInfo.name, Consts.BillingType.Ios, respData.transaction_id, respData.product_id, respData.quantity, itemConfig.price);
			return self.Billing.createAsync(billing)
		})
	}).then(function(){
		var quantity = billing.quantity
		playerDoc.resources.gem += itemConfig.gem * quantity
		playerData.push(["resources.gem", playerDoc.resources.gem])
		playerDoc.countInfo.iapCount += 1
		playerData.push(["countInfo.iapCount", playerDoc.countInfo.iapCount])
		rewards = GetStoreItemRewardsFromConfig(itemConfig)
		updateFuncs.push([self.dataService, self.dataService.addPlayerItemsAsync, playerDoc, playerData, 'addIosPlayerBillingData', null, rewards.rewardsToMe]);
		var gemAdd = {
			playerId:playerId,
			playerName:playerDoc.basicInfo.name,
			changed:itemConfig.gem * quantity,
			left:playerDoc.resources.gem,
			api:"addIosPlayerBillingData",
			params:{
				productId:productId,
				transactionId:transactionId
			}
		}

		eventFuncs.push([self.GemChange, self.GemChange.createAsync, gemAdd])
		updateFuncs.push([self.cacheService, self.cacheService.flushPlayerAsync, playerDoc._id])
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return self.cacheService.unlockAllAsync(lockPairs);
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs);
	}).then(function(){
		callback(null, playerData)
	}).then(function(){
		if(!rewards.rewardToAllianceMember || !playerDoc.allianceId) return;
		self.cacheService.findAllianceAsync(playerDoc.allianceId).then(function(doc){
			allianceDoc = doc
			var memberIds = [];
			_.each(allianceDoc.members, function(member){
				if(!_.isEqual(member.id, playerId)) memberIds.push(member.id);
			})
			(function sendRewards(){
				if(memberIds.length === 0) return;
				var memberId = memberIds.pop();
				SendAllianceMembersRewardsAsync.call(self, playerId, playerDoc.basicInfo.name, memberId, rewards.rewardToAllianceMember).finally(function(){
					sendRewards();
				})
			})();
		})
	}).catch(function(e){
		if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
		callback(e)
	})
}

/**
 * 上传Wp官方IAP信息
 * @param playerId
 * @param productId
 * @param transactionId
 * @param receiptData
 * @param callback
 */
pro.addWpOfficialPlayerBillingData = function(playerId, productId, transactionId, receiptData, callback){
	var self = this
	var playerDoc = null
	var allianceDoc = null
	var billing = null
	var playerData = []
	var lockPairs = [];
	var eventFuncs = []
	var updateFuncs = []
	var rewards = null

	var itemConfig = _.find(StoreItems.items, function(item){
		if(_.isObject(item)){
			return _.isEqual(item.productId, productId)
		}
	})
	if(!_.isObject(itemConfig))
		return callback(ErrorUtils.iapProductNotExist(playerId, productId));

	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		return self.Billing.findOneAsync({transactionId:transactionId})
	}).then(function(doc){
		if(_.isObject(doc)) return Promise.reject(ErrorUtils.duplicateIAPTransactionId(playerId, transactionId))
		var billingValidateAsync = Promise.promisify(WpOfficialBillingValidate, {context:self})
		return billingValidateAsync(playerDoc, receiptData)
	}).then(function(respData){
		lockPairs.push({type:Consts.Pairs.Player, value:playerDoc._id});
		return self.cacheService.lockAllAsync(lockPairs, true).then(function(){
			billing = CreateBillingItem(playerId, playerDoc.basicInfo.name, Consts.BillingType.WpOfficial, respData.transactionId, respData.productId, respData.quantity, itemConfig.price);
			return self.Billing.createAsync(billing)
		});
	}).then(function(){
		var quantity = billing.quantity
		playerDoc.resources.gem += itemConfig.gem * quantity
		playerData.push(["resources.gem", playerDoc.resources.gem])
		playerDoc.countInfo.iapCount += 1
		playerData.push(["countInfo.iapCount", playerDoc.countInfo.iapCount])
		rewards = GetStoreItemRewardsFromConfig(itemConfig)
		updateFuncs.push([self.dataService, self.dataService.addPlayerItemsAsync, playerDoc, playerData, 'addWpOfficialPlayerBillingData', null, rewards.rewardsToMe]);
		var gemAdd = {
			playerId:playerId,
			playerName:playerDoc.basicInfo.name,
			changed:itemConfig.gem * quantity,
			left:playerDoc.resources.gem,
			api:"addWpOfficialPlayerBillingData",
			params:{
				productId:productId,
				transactionId:transactionId
			}
		}
		eventFuncs.push([self.GemChange, self.GemChange.createAsync, gemAdd])
		updateFuncs.push([self.cacheService, self.cacheService.flushPlayerAsync, playerDoc._id])
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return self.cacheService.unlockAllAsync(lockPairs);
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		callback(null, playerData)
	}).then(function(){
		if(!rewards.rewardToAllianceMember || !playerDoc.allianceId) return;
		self.cacheService.findAllianceAsync(playerDoc.allianceId).then(function(doc){
			allianceDoc = doc
			var memberIds = [];
			_.each(allianceDoc.members, function(member){
				if(!_.isEqual(member.id, playerId)) memberIds.push(member.id);
			})
			(function sendRewards(){
				if(memberIds.length === 0) return;
				var memberId = memberIds.pop();
				SendAllianceMembersRewardsAsync.call(self, playerId, playerDoc.basicInfo.name, memberId, rewards.rewardToAllianceMember).finally(function(){
					sendRewards();
				})
			})();
		})
	}).catch(function(e){
		if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
		callback(e)
	})
}

/**
 * 上传Wp Adeasygo IAP信息
 * @param playerId
 * @param uid
 * @param transactionId
 * @param callback
 * @returns {*}
 */
pro.addWpAdeasygoPlayerBillingData = function(playerId, uid, transactionId, callback){
	var self = this
	var playerDoc = null
	var allianceDoc = null
	var billing = null
	var playerData = []
	var lockPairs = [];
	var eventFuncs = [];
	var updateFuncs = []
	var rewards = null
	var itemConfig = null;

	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		return self.Billing.findOneAsync({transactionId:transactionId})
	}).then(function(doc){
		if(_.isObject(doc)) return Promise.reject(ErrorUtils.duplicateIAPTransactionId(playerId, transactionId))
		var billingValidateAsync = Promise.promisify(WpAdeasygoBillingValidate, {context:self})
		return billingValidateAsync(playerDoc, uid, transactionId)
	}).then(function(respData){
		itemConfig = _.find(StoreItems.items, function(item){
			if(_.isObject(item)){
				return _.isEqual(item.productId, billing.productId);
			}
		})
		lockPairs.push({type:Consts.Pairs.Player, value:playerDoc._id});
		return self.cacheService.lockAllAsync(lockPairs, true).then(function(){
			billing = CreateBillingItem(playerId, playerDoc.basicInfo.name, Consts.BillingType.WpAdeasygo, respData.transactionId, respData.productId, respData.quantity, itemConfig.price);
			return self.Billing.createAsync(billing)
		});
	}).then(function(){
		var quantity = billing.quantity
		playerDoc.resources.gem += itemConfig.gem * quantity
		playerData.push(["resources.gem", playerDoc.resources.gem])
		playerDoc.countInfo.iapCount += 1
		playerData.push(["countInfo.iapCount", playerDoc.countInfo.iapCount])
		rewards = GetStoreItemRewardsFromConfig(itemConfig)
		updateFuncs.push([self.dataService, self.dataService.addPlayerItemsAsync, playerDoc, playerData, 'addWpAdeasygoPlayerBillingData', null, rewards.rewardsToMe]);
		var gemAdd = {
			playerId:playerId,
			playerName:playerDoc.basicInfo.name,
			changed:itemConfig.gem * quantity,
			left:playerDoc.resources.gem,
			api:"addWpAdeasygoPlayerBillingData",
			params:{
				productId:billing.productId,
				transactionId:transactionId
			}
		}
		eventFuncs.push([self.GemChange, self.GemChange.createAsync, gemAdd])
		updateFuncs.push([self.cacheService, self.cacheService.flushPlayerAsync, playerDoc._id])
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return self.cacheService.unlockAllAsync(lockPairs);
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		callback(null, [playerData, billing.productId])
	}).then(function(){
		if(!rewards.rewardToAllianceMember || !playerDoc.allianceId) return;
		self.cacheService.findAllianceAsync(playerDoc.allianceId).then(function(doc){
			allianceDoc = doc
			var memberIds = [];
			_.each(allianceDoc.members, function(member){
				if(!_.isEqual(member.id, playerId)) memberIds.push(member.id);
			})
			(function sendRewards(){
				if(memberIds.length === 0) return;
				var memberId = memberIds.pop();
				SendAllianceMembersRewardsAsync.call(self, playerId, playerDoc.basicInfo.name, memberId, rewards.rewardToAllianceMember).finally(function(){
					sendRewards();
				})
			})();
		})
	}).catch(function(e){
		if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
		callback(e)
	})
}

/**
 * 上传Android官方IAP信息
 * @param playerId
 * @param productId
 * @param transactionId
 * @param receiptData
 * @param receiptSignature
 * @param callback
 */
pro.addAndroidOfficialPlayerBillingData = function(playerId, productId, transactionId, receiptData, receiptSignature, callback){
	var self = this
	var playerDoc = null
	var allianceDoc = null
	var billing = null
	var playerData = []
	var lockPairs = [];
	var updateFuncs = []
	var eventFuncs = [];
	var rewards = null

	var itemConfig = _.find(StoreItems.items, function(item){
		if(_.isObject(item)){
			return _.isEqual(item.productId, productId)
		}
	})
	if(!_.isObject(itemConfig))
		return callback(ErrorUtils.iapProductNotExist(playerId, productId));

	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		return self.Billing.findOneAsync({transactionId:transactionId})
	}).then(function(doc){
		if(_.isObject(doc)) return Promise.reject(ErrorUtils.duplicateIAPTransactionId(playerId, transactionId))
		var billingValidateAsync = Promise.promisify(AndroidOfficialBillingValidate, {context:self})
		return billingValidateAsync(playerDoc, receiptData, receiptSignature)
	}).then(function(respData){
		lockPairs.push({type:Consts.Pairs.Player, value:playerDoc._id});
		return self.cacheService.lockAllAsync(lockPairs, true).then(function(){
			billing = CreateBillingItem(playerId, playerDoc.basicInfo.name, Consts.BillingType.AndroidOffical, respData.transactionId, respData.productId, respData.quantity, itemConfig.price);
			return self.Billing.createAsync(billing)
		})
	}).then(function(){
		var quantity = billing.quantity
		playerDoc.resources.gem += itemConfig.gem * quantity
		playerData.push(["resources.gem", playerDoc.resources.gem])
		playerDoc.countInfo.iapCount += 1
		playerData.push(["countInfo.iapCount", playerDoc.countInfo.iapCount])
		rewards = GetStoreItemRewardsFromConfig(itemConfig)
		updateFuncs.push([self.dataService, self.dataService.addPlayerItemsAsync, playerDoc, playerData, 'addAndroidOfficialPlayerBillingData', null, rewards.rewardsToMe]);
		var gemAdd = {
			playerId:playerId,
			playerName:playerDoc.basicInfo.name,
			changed:itemConfig.gem * quantity,
			left:playerDoc.resources.gem,
			api:"addAndroidOfficialPlayerBillingData",
			params:{
				productId:productId,
				transactionId:transactionId
			}
		}

		eventFuncs.push([self.GemChange, self.GemChange.createAsync, gemAdd])
		updateFuncs.push([self.cacheService, self.cacheService.flushPlayerAsync, playerDoc._id])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return self.cacheService.unlockAllAsync(lockPairs);
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		callback(null, playerData)
	}).then(function(){
		if(!rewards.rewardToAllianceMember || !playerDoc.allianceId) return;
		self.cacheService.findAllianceAsync(playerDoc.allianceId).then(function(doc){
			allianceDoc = doc
			var memberIds = [];
			_.each(allianceDoc.members, function(member){
				if(!_.isEqual(member.id, playerId)) memberIds.push(member.id);
			})
			(function sendRewards(){
				if(memberIds.length === 0) return;
				var memberId = memberIds.pop();
				SendAllianceMembersRewardsAsync.call(self, playerId, playerDoc.basicInfo.name, memberId, rewards.rewardToAllianceMember).finally(function(){
					sendRewards();
				})
			})();
		})
	}).catch(function(e){
		if(!ErrorUtils.isObjectLockedError(e) && lockPairs.length > 0) self.cacheService.unlockAll(lockPairs);
		callback(e)
	})
}