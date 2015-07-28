"use strict"

/**
 * Created by modun on 14-7-23.
 */

var ShortId = require("shortid")
var Promise = require("bluebird")
var _ = require("underscore")

var Utils = require("../utils/utils")
var DataUtils = require("../utils/dataUtils")
var LogicUtils = require("../utils/logicUtils")
var ErrorUtils = require("../utils/errorUtils")
var ReportUtils = require('../utils/reportUtils')
var Events = require("../consts/events")
var Consts = require("../consts/consts")
var Define = require("../consts/define")

var PlayerApiService3 = function(app){
	this.app = app
	this.env = app.get("env")
	this.pushService = app.get("pushService")
	this.cacheService = app.get('cacheService');
	this.dataService = app.get("dataService")
	this.Deal = app.get("Deal")
	this.GemUse = app.get("GemUse")
}
module.exports = PlayerApiService3
var pro = PlayerApiService3.prototype


/**
 * 取消收藏邮件
 * @param playerId
 * @param mailId
 * @param callback
 */
pro.unSaveMail = function(playerId, mailId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		var mail = LogicUtils.getPlayerMailById(playerDoc, mailId)
		if(!_.isObject(mail)) return Promise.reject(ErrorUtils.mailNotExist(playerId, mailId))
		mail.isSaved = false
		playerData.push(["mails." + playerDoc.mails.indexOf(mail) + ".isSaved", mail.isSaved])
		return self.cacheService.updatePlayerAsync(playerId, playerDoc)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 获取玩家邮件
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getMails = function(playerId, fromIndex, callback){
	var playerDoc = null
	var mails = []
	this.cacheService.directFindPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		for(var i = playerDoc.mails.length - 1; i >= 0; i--){
			var mail = playerDoc.mails[i]
			mail.index = i
			mails.push(mail)
		}
		mails = mails.slice(fromIndex, fromIndex + Define.PlayerMaxReturnMailSize)
		return Promise.resolve()
	}).then(function(){
		callback(null, mails)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 获取玩家已发邮件
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getSendMails = function(playerId, fromIndex, callback){
	var playerDoc = null
	var mails = []
	this.cacheService.directFindPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		for(var i = playerDoc.sendMails.length - 1; i >= 0; i--){
			var mail = playerDoc.sendMails[i]
			mail.index = i
			mails.push(mail)
		}
		mails = mails.slice(fromIndex, fromIndex + Define.PlayerMaxReturnMailSize)
		return Promise.resolve()
	}).then(function(){
		callback(null, mails)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 获取玩家已存邮件
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getSavedMails = function(playerId, fromIndex, callback){
	var playerDoc = null
	var mails = []
	this.cacheService.directFindPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		for(var i = playerDoc.mails.length - 1; i >= 0; i--){
			var mail = playerDoc.mails[i]
			mail.index = i
			if(!!mail.isSaved) mails.push(mail)
		}
		mails = mails.slice(fromIndex, fromIndex + Define.PlayerMaxReturnMailSize)
		return Promise.resolve()
	}).then(function(){
		callback(null, mails)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 删除邮件
 * @param playerId
 * @param mailIds
 * @param callback
 */
pro.deleteMails = function(playerId, mailIds, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		for(var i = 0; i < mailIds.length; i++){
			(function(){
				var mail = LogicUtils.getPlayerMailById(playerDoc, mailIds[i])
				if(!_.isObject(mail)) return;
				playerData.push(["mails." + playerDoc.mails.indexOf(mail), null])
				LogicUtils.removeItemInArray(playerDoc.mails, mail)
			})()
		}
		return self.cacheService.updatePlayerAsync(playerId, playerDoc)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 删除已发邮件
 * @param playerId
 * @param mailIds
 * @param callback
 */
pro.deleteSendMails = function(playerId, mailIds, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		for(var i = 0; i < mailIds.length; i++){
			(function(){
				var mailId = mailIds[i]
				var mail = _.find(playerDoc.sendMails, function(mail){
					return _.isEqual(mail.id, mailId)
				})
				if(!_.isObject(mail)) return;
				playerData.push(["sendMails." + playerDoc.sendMails.indexOf(mail), null])
				LogicUtils.removeItemInArray(playerDoc.sendMails, mail)
			})()
		}
		return self.cacheService.updatePlayerAsync(playerId, playerDoc);
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 阅读战报
 * @param playerId
 * @param reportIds
 * @param callback
 */
pro.readReports = function(playerId, reportIds, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		for(var i = 0; i < reportIds.length; i++){
			(function(){
				var report = LogicUtils.getPlayerReportById(playerDoc, reportIds[i])
				if(!_.isObject(report)) return;
				report.isRead = true
				playerData.push(["reports." + playerDoc.reports.indexOf(report) + ".isRead", true])
			})()
		}
		return self.cacheService.updatePlayerAsync(playerId, playerDoc)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 收藏战报
 * @param playerId
 * @param reportId
 * @param callback
 */
pro.saveReport = function(playerId, reportId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		var report = LogicUtils.getPlayerReportById(playerDoc, reportId)
		if(!_.isObject(report)) return Promise.reject(ErrorUtils.reportNotExist(playerId, reportId))
		report.isSaved = true
		playerData.push(["reports." + playerDoc.reports.indexOf(report) + ".isSaved", true])
		return self.cacheService.updatePlayerAsync(playerId, playerDoc)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 取消收藏战报
 * @param playerId
 * @param reportId
 * @param callback
 */
pro.unSaveReport = function(playerId, reportId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		var report = LogicUtils.getPlayerReportById(playerDoc, reportId)
		if(!_.isObject(report)) return Promise.reject(ErrorUtils.reportNotExist(playerId, reportId))
		report.isSaved = false
		playerData.push(["reports." + playerDoc.reports.indexOf(report) + ".isSaved", report.isSaved])
		return self.cacheService.updatePlayerAsync(playerId, playerDoc)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 获取玩家战报
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getReports = function(playerId, fromIndex, callback){
	var playerDoc = null
	var reports = []
	this.cacheService.directFindPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		for(var i = playerDoc.reports.length - 1; i >= 0; i--){
			var report = playerDoc.reports[i]
			report.index = i
			reports.push(report)
		}
		reports = reports.slice(fromIndex, fromIndex + Define.PlayerMaxReturnReportSize)
		return Promise.resolve()
	}).then(function(){
		callback(null, reports)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 获取玩家已存战报
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getSavedReports = function(playerId, fromIndex, callback){
	var playerDoc = null
	var reports = []
	this.cacheService.directFindPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		for(var i = playerDoc.reports.length - 1; i >= 0; i--){
			var report = playerDoc.reports[i]
			report.index = i
			if(!!report.isSaved) reports.push(report)
		}
		reports = reports.slice(fromIndex, fromIndex + Define.PlayerMaxReturnReportSize)
		return Promise.resolve()
	}).then(function(){
		callback(null, reports)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 删除战报
 * @param playerId
 * @param reportIds
 * @param callback
 */
pro.deleteReports = function(playerId, reportIds, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		for(var i = 0; i < reportIds.length; i++){
			(function(){
				var report = LogicUtils.getPlayerReportById(playerDoc, reportIds[i])
				if(!_.isObject(report)) return;
				playerData.push(["reports." + playerDoc.reports.indexOf(report), null])
				LogicUtils.removeItemInArray(playerDoc.reports, report)
			})()
		}
		return self.cacheService.updatePlayerAsync(playerId, playerDoc)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerId, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 获取玩家可视化数据数据
 * @param playerId
 * @param targetPlayerId
 * @param callback
 */
pro.getPlayerViewData = function(playerId, targetPlayerId, callback){
	var playerViewData = {}
	this.cacheService.directFindPlayerAsync(targetPlayerId).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(ErrorUtils.playerNotExist(playerId, targetPlayerId))
		playerViewData._id = doc._id
		playerViewData.basicInfo = doc.basicInfo
		playerViewData.buildings = doc.buildings
		playerViewData.soldiers = doc.soldiers
		playerViewData.helpedByTroops = doc.helpedByTroops
		return Promise.resolve()
	}).then(function(){
		callback(null, playerViewData)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 设置驻防使用的龙
 * @param playerId
 * @param dragonType
 * @param callback
 */
pro.setDefenceDragon = function(playerId, dragonType, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	var updateFuncs = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		var dragon = playerDoc.dragons[dragonType]
		if(dragon.star <= 0) return Promise.reject(ErrorUtils.dragonNotHatched(playerId, dragon.type))
		if(!_.isEqual(Consts.DragonStatus.Free, dragon.status)) return Promise.reject(ErrorUtils.dragonIsNotFree(playerId, dragon.type))
		if(dragon.hp <= 0) return Promise.reject(ErrorUtils.dragonSelectedIsDead(playerId, dragon.type))

		var defenceDragon = LogicUtils.getPlayerDefenceDragon(playerDoc)
		if(_.isObject(defenceDragon)){
			DataUtils.refreshPlayerDragonsHp(playerDoc, defenceDragon)
			defenceDragon.status = Consts.DragonStatus.Free
			playerData.push(["dragons." + defenceDragon.type, defenceDragon])
		}

		dragon.status = Consts.DragonStatus.Defence
		playerData.push(["dragons." + dragon.type + ".status", dragon.status])

		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, playerDoc._id, playerDoc])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 取消驻防
 * @param playerId
 * @param callback
 */
pro.cancelDefenceDragon = function(playerId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	var updateFuncs = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		var dragon = LogicUtils.getPlayerDefenceDragon(playerDoc)
		if(!_.isObject(dragon)) return Promise.reject(ErrorUtils.noDragonInDefenceStatus(playerId))
		DataUtils.refreshPlayerDragonsHp(playerDoc, dragon)
		dragon.status = Consts.DragonStatus.Free
		playerData.push(["dragons." + dragon.type, dragon])

		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, playerDoc._id, playerDoc])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 出售商品
 * @param playerId
 * @param type
 * @param name
 * @param count
 * @param price
 * @param callback
 */
pro.sellItem = function(playerId, type, name, count, price, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	var updateFuncs = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		DataUtils.refreshPlayerResources(playerDoc)
		if(!DataUtils.isPlayerSellQueueEnough(playerDoc)) return Promise.reject(ErrorUtils.sellQueueNotEnough(playerId))
		var realCount = _.isEqual(type, "resources") ? count * 1000 : count
		if(playerDoc[type][name] < realCount) return Promise.reject(ErrorUtils.resourceNotEnough(playerId, type, name, playerDoc[type][name], realCount))
		var cartNeed = DataUtils.getPlayerCartUsedForSale(playerDoc, type, name, realCount)
		if(cartNeed > playerDoc.resources.cart) return Promise.reject(ErrorUtils.cartNotEnough(playerId, playerDoc.resources.cart, cartNeed))

		playerDoc[type][name] -= realCount
		playerData.push([type + "." + name, playerDoc[type][name]])
		playerDoc.resources.cart -= cartNeed

		var deal = LogicUtils.createDeal(playerDoc, type, name, count, price)
		playerDoc.deals.push(deal.dealForPlayer)
		playerData.push(["deals." + playerDoc.deals.indexOf(deal.dealForPlayer), deal.dealForPlayer])

		DataUtils.refreshPlayerResources(playerDoc)
		playerData.push(["resources", playerDoc.resources])
		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, playerDoc._id, playerDoc])
		updateFuncs.push([self.Deal, self.Deal.createAsync, deal.dealForAll])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 获取商品列表
 * @param playerId
 * @param type
 * @param name
 * @param callback
 */
pro.getSellItems = function(playerId, type, name, callback){
	var self = this
	var playerDoc = null
	var itemDocs = null
	this.cacheService.directFindPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		return self.Deal.find({
			//"playerId":{$ne:playerDoc._id},
			"serverId":playerDoc.serverId,
			"itemData.type":type, "itemData.name":name
		}).sort({
			"itemData.price":1,
			"addedTime":1
		}).limit(Define.SellItemsMaxSize).exec()
	}).then(function(docs){
		itemDocs = docs
		return Promise.resolve()
	}).then(function(){
		callback(null, itemDocs)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 购买出售的商品
 * @param playerId
 * @param itemId
 * @param callback
 */
pro.buySellItem = function(playerId, itemId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	var sellerDoc = null
	var sellerData = []
	var itemDoc = null
	var pushFuncs = []
	var updateFuncs = []
	var funcs = []
	funcs.push(this.cacheService.findPlayerAsync(playerId))
	funcs.push(this.Deal.findOneAsync({_id:itemId}))
	Promise.all(funcs).spread(function(doc_1, doc_2){
		playerDoc = doc_1
		if(!_.isObject(doc_2)) return Promise.reject(ErrorUtils.sellItemNotExist(playerId, itemId))
		itemDoc = doc_2
		if(!_.isEqual(itemDoc.serverId, playerDoc.serverId)) return Promise.reject(ErrorUtils.sellItemNotExist(playerId, itemId))
		if(_.isEqual(itemDoc.playerId, playerDoc._id)) return Promise.reject(ErrorUtils.canNotBuyYourOwnSellItem(playerId, itemId));
		DataUtils.refreshPlayerResources(playerDoc)
		var type = itemDoc.itemData.type
		var count = itemDoc.itemData.count
		var realCount = _.isEqual(type, "resources") ? count * 1000 : count
		var totalPrice = itemDoc.itemData.price * count
		var buyedResources = DataUtils.buyResources(playerDoc, {coin:totalPrice}, playerDoc.resources)
		var gemUsed = buyedResources.gemUsed
		if(gemUsed > playerDoc.resources.gem) return Promise.reject(ErrorUtils.gemNotEnough(playerId))
		if(gemUsed > 0){
			playerDoc.resources.gem -= gemUsed
			var gemUse = {
				playerId:playerId,
				used:gemUsed,
				left:playerDoc.resources.gem,
				api:"createHouse"
			}
			updateFuncs.push([self.GemUse, self.GemUse.createAsync, gemUse])
		}
		LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		playerDoc.resources.coin -= totalPrice
		playerDoc[type][itemDoc.itemData.name] += realCount
		if(!_.isEqual(type, "resources"))
			playerData.push([type + "." + itemDoc.itemData.name, playerDoc[type][itemDoc.itemData.name]])
		DataUtils.refreshPlayerResources(playerDoc)
		playerData.push(["resources", playerDoc.resources])
		return self.cacheService.findPlayerAsync(itemDoc.playerId)
	}).then(function(doc){
		sellerDoc = doc
		var sellItem = _.find(sellerDoc.deals, function(deal){
			return _.isEqual(deal.id, itemId)
		})
		sellItem.isSold = true
		sellerData.push(["deals." + sellerDoc.deals.indexOf(sellItem) + ".isSold", sellItem.isSold])

		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, playerDoc._id, playerDoc])
		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, sellerDoc._id, sellerDoc])
		updateFuncs.push([self.Deal, self.Deal.findOneAndRemoveAsync, {_id:itemId}])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, sellerDoc, sellerData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		if(_.isObject(sellerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(sellerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 获取出售后赚取的银币
 * @param playerId
 * @param itemId
 * @param callback
 */
pro.getMyItemSoldMoney = function(playerId, itemId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	var updateFuncs = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		var sellItem = _.find(playerDoc.deals, function(deal){
			return _.isEqual(deal.id, itemId)
		})
		if(!_.isObject(sellItem)) return Promise.reject(ErrorUtils.sellItemNotExist(playerId, itemId))
		if(!sellItem.isSold) return Promise.reject(ErrorUtils.sellItemNotSold(playerId, sellItem))
		DataUtils.refreshPlayerResources(playerDoc)
		playerData.push(["resources", playerDoc.resources])
		var totalPrice = sellItem.itemData.count * sellItem.itemData.price
		playerDoc.resources.coin += totalPrice
		playerData.push(["deals." + playerDoc.deals.indexOf(sellItem), null])
		LogicUtils.removeItemInArray(playerDoc.deals, sellItem)

		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, playerDoc._id, playerDoc])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 下架商品
 * @param playerId
 * @param itemId
 * @param callback
 */
pro.removeMySellItem = function(playerId, itemId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	var itemDoc = null
	var updateFuncs = []
	var funcs = []
	funcs.push(this.cacheService.findPlayerAsync(playerId))
	funcs.push(this.Deal.findOneAsync({_id:itemId}))
	Promise.all(funcs).spread(function(doc_1, doc_2){
		playerDoc = doc_1
		if(!_.isObject(doc_2)) return Promise.reject(ErrorUtils.sellItemNotExist(playerId, itemId))
		itemDoc = doc_2
		if(!_.isEqual(itemDoc.playerId, playerDoc._id)) return Promise.reject(ErrorUtils.sellItemNotBelongsToYou(playerId, itemDoc))
		var sellItem = _.find(playerDoc.deals, function(deal){
			return _.isEqual(deal.id, itemId)
		})
		if(!!sellItem.isSold) return Promise.reject(ErrorUtils.sellItemAlreadySold(playerId, sellItem))

		DataUtils.refreshPlayerResources(playerDoc)
		playerData.push(["resources", playerDoc.resources])
		var type = itemDoc.itemData.type
		var count = itemDoc.itemData.count
		var realCount = _.isEqual(type, "resources") ? count * 1000 : count
		playerDoc[type][itemDoc.itemData.name] += realCount
		playerData.push([type + "." + itemDoc.itemData.name, playerDoc[type][itemDoc.itemData.name]])
		playerData.push(["deals." + playerDoc.deals.indexOf(sellItem), null])
		LogicUtils.removeItemInArray(playerDoc.deals, sellItem)

		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, playerDoc._id, playerDoc])
		updateFuncs.push([self.Deal, self.Deal.findOneAndRemoveAsync, {_id:itemId}])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 设置玩家Apple Push Notification Id
 * @param playerId
 * @param apnId
 * @param callback
 */
pro.setApnId = function(playerId, apnId, callback){
	var self = this
	var playerDoc = null
	var playerData = []
	var allianceDoc = null
	var updateFuncs = []
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc
		if(_.isEqual(apnId, playerDoc.apnId)) return Promise.reject(ErrorUtils.apnIdAlreadySeted(playerId, apnId))
		playerDoc.apnId = apnId
		playerData.push(["apnId", playerDoc.apnId])
		updateFuncs.push([self.cacheService, self.cacheService.updatePlayerAsync, playerDoc._id, playerDoc])
		if(_.isString(playerDoc.allianceId)){
			return self.cacheService.findAllianceAsync(playerDoc.allianceId).then(function(doc){
				allianceDoc = doc
				return Promise.resolve()
			})
		}else{
			return Promise.resolve()
		}
	}).then(function(){
		if(_.isObject(allianceDoc)){
			var memberObject = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id)
			memberObject.apnId = playerDoc.apnId
			updateFuncs.push([self.cacheService, self.cacheService.updateAllianceAsync, allianceDoc._id, allianceDoc])
		}
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		callback(null, playerData)
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		if(_.isObject(allianceDoc)){
			funcs.push(self.cacheService.updateAllianceAsync(allianceDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 进攻PvE关卡
 * @param playerId
 * @param sectionName
 * @param dragonType
 * @param soldiers
 * @param callback
 */
pro.attackPveSection = function(playerId, sectionName, dragonType, soldiers, callback){
	var self = this;
	var playerDoc = null;
	var playerData = [];
	var updateFuncs = [];
	var eventFuncs = [];
	this.cacheService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		var playerDragon = playerDoc.dragons[dragonType]
		if(dragon.star <= 0) return Promise.reject(ErrorUtils.dragonNotHatched(playerId, dragonType))
		if(_.isEqual(Consts.DragonStatus.March, dragon.status)) return Promise.reject(ErrorUtils.dragonIsNotFree(playerId, dragon.type))
		DataUtils.refreshPlayerDragonsHp(playerDoc, dragon)
		if(dragon.hp <= 0) return Promise.reject(ErrorUtils.dragonSelectedIsDead(playerId, dragon.type))
		if(!LogicUtils.isPlayerMarchSoldiersLegal(playerDoc, soldiers)) return Promise.reject(ErrorUtils.soldierNotExistOrCountNotLegal(playerId, soldiers))
		if(!LogicUtils.isPlayerDragonLeadershipEnough(playerDoc, dragon, soldiers)) return Promise.reject(ErrorUtils.dragonLeaderShipNotEnough(playerId, dragon.type))
		var sectionParams = sectionName.split('_');
		var stageIndex = parseInt(sectionParams[0]) - 1;
		var sectionIndex = parseInt(sectionParams[1]) - 1;
		if(!LogicUtils.isPveSectionUnlocked(playerDoc, stageIndex, sectionIndex)) return Promise.reject(ErrorUtils.pveSecionIsLocked(playerId, stageIndex, sectionIndex));

		var playerDragonForFight = DataUtils.createPlayerDragonForFight(playerDoc, playerDragon, playerDoc.basicInfo.terrain);
		var playerSoldiersForFight = DataUtils.createPlayerSoldiersForFight(playerDoc, soldiers, playerDragon, playerDoc.basicInfo.terrain, true);
		var playerTreatSoldierPercent = DataUtils.getPlayerTreatSoldierPercent(playerDoc, playerDragon);
		var playerSoldierMoraleDecreasedPercent = DataUtils.getPlayerSoldierMoraleDecreasedPercent(playerDoc, playerDragon);
		var playerToEnemySoldierMoralDecreasedAddPercent = DataUtils.getEnemySoldierMoraleAddedPercent(playerDoc, playerDragon);
		var sectionTroopForFight = DataUtils.createPveSecionTroopForFight(sectionName, playerDoc.basicInfo.terrain);
		var sectionDragonForFight = sectionTroopForFight.dragonForFight;
		var sectionSoldiersForFight = sectionTroopForFight.soldiersForFight;
		var dragonFightFixEffect = DataUtils.getDragonFightFixedEffect(playerDragonForFight, sectionSoldiersForFight);
		var dragonFightData = FightUtils.dragonToDragonFight(playerDragonForFight, sectionDragonForFight, dragonFightFixEffect);
		var soldierFightData = FightUtils.soldierToSoldierFight(playerSoldiersForFight, playerTreatSoldierPercent, playerSoldierMoraleDecreasedPercent, sectionSoldiersForFight, 0, 1 + playerToEnemySoldierMoralDecreasedAddPercent)
		var report = ReportUtils.createAttackPveSectionReport(playerDoc, sectionName, dragonFightData, soldierFightData);
		playerDragon.hp -= report.playerDragonHpDecreased;
		if(playerDragon.hp <= 0){
			var deathEvent = DataUtils.createPlayerDragonDeathEvent(playerDoc, playerDragon);
			playerDoc.dragonDeathEvents.push(deathEvent);
			playerData.push(["dragonDeathEvents." + playerDoc.dragonDeathEvents.indexOf(deathEvent), deathEvent]);
			eventFuncs.push([self.timeEventService, self.timeEventService.addPlayerTimeEventAsync, playerDoc, "dragonDeathEvents", deathEvent.id, deathEvent.finishTime - Date.now()]);
		}
		DataUtils.addPlayerDragonExp(playerDoc, playerData, playerDragon, report.playerDragonExpAdd);
		playerData.push(["dragons." + playerDragon.type + ".hp", playerDragon.hp]);
		playerData.push(["dragons." + playerDragon.type + ".hpRefreshTime", playerDragon.hpRefreshTime]);
		LogicUtils.addPlayerSoldiers(playerDoc, playerData, report.playerSoldiers);
		DataUtils.addPlayerWoundedSoldiers(playerDoc, playerData, report.playerWoundedSoldiers);
		DataUtils.refreshPlayerPower(playerDoc, playerData);
		//DataUtils.refreshPlayerResources(playerDoc);
		//playerData.push(["resources", playerDoc.resources]);
		LogicUtils.addPlayerRewards(playerDoc, playerData, report.playerRewards);
		LogicUtils.updatePlayerPveData(playerDoc, playerData, stageIndex, sectionIndex, report.fightStar);

		updateFuncs.push([self.dataService, self.dataService.updatePlayerAsync, playerDoc._id, playerDoc]);
		return LogicUtils.excuteAll(updateFuncs);
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs);
	}).then(function(){
		callback(null, playerData);
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}

/**
 * 扫荡关卡
 * @param playerId
 * @param sectionName
 * @param count
 * @param callback
 */
pro.sweepPveSection = function(playerId, sectionName, count, callback){

}

/**
 * 获取关卡星级奖励
 * @param playerId
 * @param stageName
 * @param callback
 */
pro.getPveStageReward = function(playerId, stageName, callback){
	var self = this;
	var playerDoc = null;
	var playerData = [];
	var updateFuncs = [];
	this.dataService.findPlayerAsync(playerId).then(function(doc){
		playerDoc = doc;
		var stageParams = stageName.split('_');
		var stageIndex = parseInt(stageParams[0]) - 1;
		var rewardIndex = parseInt(stageParams[1]);
		if(!_.isObject(playerDoc.pve[stageIndex])) return Promise.reject(ErrorUtils.canNotGetPvEStarRewardyet(playerId, stageName));
		var rewardedIndex = _.find(playerDoc.pve[stageIndex].rewarded, function(rewardedIndex){
			return rewardedIndex == rewardIndex;
		})
		if(!!rewardedIndex) return Promise.reject(ErrorUtils.pveStarRewardAlreadyGet(playerId, stageName));
		if(!DataUtils.isPlayerPvEStageRewardStarEnough(playerDoc, stageName)) return Promise.reject(ErrorUtils.canNotGetPvEStarRewardyet(playerId, stageName));
		var rewards = DataUtils.getPveStageRewards(stageName);
		LogicUtils.addPlayerRewards(playerDoc, playerData, rewards);
		playerDoc.pve[stageIndex].rewarded.push(rewardIndex)
		playerData.push(['pve.' + stageIndex + '.rewarded', playerDoc.pve[stageIndex].rewarded]);

		updateFuncs.push([self.dataService, self.dataService.updatePlayerAsync, playerId, playerDoc]);
		return LogicUtils.excuteAll(updateFuncs);
	}).then(function(){
		callback(null, playerData);
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.cacheService.updatePlayerAsync(playerDoc._id, null))
		}
		Promise.all(funcs).then(function(){
			callback(e)
		})
	})
}