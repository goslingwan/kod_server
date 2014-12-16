"use strict"

/**
 * Created by modun on 14/12/10.
 */

var Promise = require("bluebird")
var _ = require("underscore")

var Utils = require("../utils/utils")
var DataUtils = require("../utils/dataUtils")
var LogicUtils = require("../utils/logicUtils")
var ReportUtils = require("../utils/reportUtils")
var MarchUtils = require("../utils/marchUtils")
var Events = require("../consts/events")
var Consts = require("../consts/consts")
var Define = require("../consts/define")


var AllianceApiService4 = function(app){
	this.app = app
	this.env = app.get("env")
	this.pushService = app.get("pushService")
	this.timeEventService = app.get("timeEventService")
	this.globalChannelService = app.get("globalChannelService")
	this.allianceDao = app.get("allianceDao")
	this.playerDao = app.get("playerDao")
}
module.exports = AllianceApiService4
var pro = AllianceApiService4.prototype

/**
 * 获取联盟可视化数据
 * @param playerId
 * @param targetAllianceId
 * @param callback
 */
pro.getAllianceViewData = function(playerId, targetAllianceId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(targetAllianceId)){
		callback(new Error("targetAllianceId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
		playerDoc = doc
		return self.allianceDao.findByIdAsync(targetAllianceId)
	}).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("联盟不存在"))
		allianceDoc = doc
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, allianceDoc._id])
		pushFuncs.push([self.pushService, self.pushService.onGetAllianceViewDataSuccessAsync, playerDoc, allianceDoc])
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(_.isObject(allianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(allianceDoc._id))
		}
		if(funcs.length > 0){
			Promise.all(funcs).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 根据Tag搜索联盟战斗数据
 * @param playerId
 * @param tag
 * @param callback
 */
pro.searchAllianceInfoByTag = function(playerId, tag, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(tag)){
		callback(new Error("tag 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var funcs = []
		funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		funcs.push(self.allianceDao.searchByIndexAsync("basicInfo.tag", tag))
		return Promise.all(funcs)
	}).spread(function(tmp, docs){
		return self.pushService.onSearchAllianceInfoByTagSuccessAsync(playerDoc, docs)
	}).then(function(){
		callback()
	}).catch(function(e){
		if(_.isObject(playerDoc)){
			self.playerDao.removeLockByIdAsync(playerDoc._id).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 查看战力相近的3个联盟的数据
 * @param playerId
 * @param callback
 */
pro.getNearedAllianceInfos = function(playerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []

	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("联盟不存在"))
		allianceDoc = doc
		updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, allianceDoc._id])
		var funcs = []
		funcs.push(self.allianceDao.getModel().find({"basicInfo.power":{$lt:allianceDoc.basicInfo.power}}).sort({"basicInfo.power": -1}).limit(3).exec())
		funcs.push(self.allianceDao.getModel().find({"basicInfo.power":{$gt:allianceDoc.basicInfo.power}}).sort({"basicInfo.power": 1}).limit(3).exec())
		return Promise.all(funcs)
	}).spread(function(docsSmall, docsBig){
		var allianceDocs = []
		allianceDocs.push(allianceDoc)
		allianceDocs.concat(docsSmall)
		allianceDocs.concat(docsBig)
		pushFuncs.push([self.pushService, self.pushService.onGetNearedAllianceInfosSuccessAsync, playerDoc, allianceDocs])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(funcs.length > 0){
			Promise.all(funcs).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 协助联盟其他玩家防御
 * @param playerId
 * @param dragonType
 * @param soldiers
 * @param targetPlayerId
 * @param callback
 */
pro.helpAllianceMemberDefence = function(playerId, dragonType, soldiers, targetPlayerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!DataUtils.isDragonTypeExist(dragonType)){
		callback(new Error("dragonType 不合法"))
		return
	}
	if(!_.isArray(soldiers)){
		callback(new Error("soldiers 不合法"))
		return
	}
	if(!_.isString(targetPlayerId)){
		callback(new Error("targetPlayerId 不合法"))
		return
	}
	if(_.isEqual(playerId, targetPlayerId)){
		callback(new Error("不能对自己协防"))
		return
	}

	var self = this
	var playerDoc = null
	var targetPlayerDoc = null
	var allianceDoc = null
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []
	var playerData = {}
	var allianceData = {}
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		var dragon = playerDoc.dragons[dragonType]
		if(dragon.star <= 0) return Promise.reject(new Error("龙还未孵化"))
		if(!_.isEqual(Consts.DragonStatus.Free, dragon.status)) return Promise.reject(new Error("龙未处于空闲状态"))
		if(dragon.hp == 0) return Promise.reject(new Error("所选择的龙已经阵亡"))
		dragon.status = Consts.DragonStatus.March
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDoc.dragons[dragonType]
		if(!LogicUtils.isMarchSoldierLegal(playerDoc, soldiers)) return Promise.reject(new Error("士兵不存在或士兵数量不合法"))
		playerData.soldiers = {}
		_.each(soldiers, function(soldier){
			soldier.star = 1
			playerDoc.soldiers[soldier.name] -= soldier.count
			playerData.soldiers[soldier.name] = playerDoc.soldiers[soldier.name]
		})
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		if(LogicUtils.isPlayerHasTroopHelpedPlayer(allianceDoc, playerDoc, targetPlayerId)) return Promise.reject(new Error("玩家已经对目标玩家派出了协防部队"))
		return self.playerDao.findByIdAsync(targetPlayerId)
	}).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
		targetPlayerDoc = doc
		if(DataUtils.isAlliancePlayerBeHelpedTroopsReachMax(allianceDoc, targetPlayerDoc)) return Promise.reject(new Error("目标玩家协防部队数量已达最大"))
		var event = MarchUtils.createHelpDefenceMarchEvent(playerDoc, allianceDoc, playerDoc.dragons[dragonType], soldiers, targetPlayerDoc)
		allianceDoc.attackMarchEvents.push(event)
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, targetPlayerDoc._id])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, allianceDoc, "attackMarchEvents", event.id, event.arriveTime])
		allianceData.__attackMarchEvents = [{
			type:Consts.DataChangedType.Add,
			data:event
		}]
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
		LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(allianceDoc, allianceData, pushFuncs, self.pushService)
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(_.isObject(targetPlayerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(targetPlayerDoc._id))
		}
		if(_.isObject(allianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(allianceDoc._id))
		}
		if(funcs.length > 0){
			Promise.all(funcs).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 从被协防的联盟成员城市撤兵
 * @param playerId
 * @param beHelpedPlayerId
 * @param callback
 */
pro.retreatFromBeHelpedAllianceMember = function(playerId, beHelpedPlayerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(beHelpedPlayerId)){
		callback(new Error("beHelpedPlayerId 不合法"))
		return
	}
	if(_.isEqual(playerId, beHelpedPlayerId)){
		callback(new Error("不能从自己的城市撤销协防部队"))
		return
	}

	var self = this
	var playerDoc = null
	var beHelpedPlayerDoc = null
	var allianceDoc = null
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []
	var playerData = {}
	var beHelpedPlayerData = {}
	var allianceData = {}
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!LogicUtils.isPlayerHasHelpedTroopInAllianceMember(playerDoc, beHelpedPlayerId)) return Promise.reject(new Error("玩家没有协防部队驻扎在目标玩家城市"))
		var funcs = []
		funcs.push(self.allianceDao.findByIdAsync(playerDoc.alliance.id))
		funcs.push(self.playerDao.findByIdAsync(beHelpedPlayerId))
		return Promise.all(funcs)
	}).spread(function(doc_1, doc_2){
		if(!_.isObject(doc_1)) return Promise.reject(new Error("联盟不存在"))
		if(!_.isObject(doc_2)) return Promise.reject(new Error("玩家不存在"))
		allianceDoc = doc_1
		beHelpedPlayerDoc = doc_2
		var helpTroop = _.find(beHelpedPlayerDoc.helpedByTroops, function(troop){
			return _.isEqual(troop.id, playerId)
		})
		LogicUtils.removeItemInArray(beHelpedPlayerDoc.helpedByTroops, helpTroop)
		beHelpedPlayerData.__helpedByTroops = {
			type:Consts.DataChangedType.Remove,
			data:helpTroop
		}
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, beHelpedPlayerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, beHelpedPlayerDoc, beHelpedPlayerData])

		var helpToTroop = _.find(playerDoc.helpToTroops, function(troop){
			return _.isEqual(troop.beHelpedPlayerData.id, beHelpedPlayerDoc._id)
		})
		LogicUtils.removeItemInArray(playerDoc.helpToTroops, helpToTroop)
		playerData.__helpToTroops = [{
			type:Consts.DataChangedType.Remove,
			data:helpToTroop
		}]
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

		var targetMemberInAlliance = LogicUtils.getAllianceMemberById(allianceDoc, beHelpedPlayerDoc._id)
		targetMemberInAlliance.helpedByTroopsCount -= 1
		allianceData.__members = [{
			type:Consts.DataChangedType.Edit,
			data:targetMemberInAlliance
		}]

		var marchReturnEvent = MarchUtils.createHelpDefenceMarchReturnEvent(playerDoc, beHelpedPlayerDoc, allianceDoc, helpTroop.dragon, helpTroop.dragon.expAdd, helpTroop.soldiers, helpTroop.woundedSoldiers, helpTroop.rewards, helpTroop.kill)
		allianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
		allianceData.__attackMarchReturnEvents = [{
			type:Consts.DataChangedType.Add,
			data:marchReturnEvent
		}]
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc, allianceData])
		eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, allianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
		LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(allianceDoc, allianceData, pushFuncs, self.pushService)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(_.isObject(beHelpedPlayerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(beHelpedPlayerDoc._id))
		}
		if(_.isObject(allianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(allianceDoc._id))
		}
		if(funcs.length > 0){
			Promise.all(funcs).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 突袭玩家城市
 * @param playerId
 * @param dragonType
 * @param defencePlayerId
 * @param callback
 */
pro.strikePlayerCity = function(playerId, dragonType, defencePlayerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!DataUtils.isDragonTypeExist(dragonType)){
		callback(new Error("dragonType 不合法"))
		return
	}
	if(!_.isString(defencePlayerId)){
		callback(new Error("defencePlayerId 不合法"))
		return
	}

	var self = this
	var attackPlayerDoc = null
	var attackPlayerData = {}
	var defencePlayerDoc = null
	var attackAllianceDoc = null
	var attackAllianceData = {}
	var defenceAllianceDoc = null
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []

	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
		attackPlayerDoc = doc
		var dragon = attackPlayerDoc.dragons[dragonType]
		if(dragon.star <= 0) return Promise.reject(new Error("龙还未孵化"))
		if(!_.isEqual(Consts.DragonStatus.Free, dragon.status)) return Promise.reject(new Error("龙未处于空闲状态"))
		if(dragon.hp == 0) return Promise.reject(new Error("所选择的龙已经阵亡"))
		if(!_.isObject(attackPlayerDoc.alliance) || _.isEmpty(attackPlayerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		dragon.status = Consts.DragonStatus.March
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
		attackPlayerData.dragons = {}
		attackPlayerData.dragons[dragonType] = attackPlayerDoc.dragons[dragonType]
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])
		return self.allianceDao.findByIdAsync(attackPlayerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("联盟不存在"))
		attackAllianceDoc = doc
		if(!_.isEqual(attackAllianceDoc.basicInfo.status, Consts.AllianceStatus.Fight)){
			return Promise.reject(new Error("联盟未处于战争期"))
		}
		var allianceFightData = attackAllianceDoc.allianceFight
		var defenceAllianceId = _.isEqual(attackAllianceDoc._id, allianceFightData.attackAllianceId) ? allianceFightData.defenceAllianceId : allianceFightData.attackAllianceId
		var funcs = []
		funcs.push(self.allianceDao.findByIdAsync(defenceAllianceId))
		funcs.push(self.playerDao.findByIdAsync(defencePlayerId))
		return Promise.all(funcs)
	}).spread(function(doc_1, doc_2){
		if(!_.isObject(doc_1)) return Promise.reject(new Error("联盟不存在"))
		defenceAllianceDoc = doc_1
		if(!_.isObject(doc_2)) return Promise.reject(new Error("玩家不存在"))
		defencePlayerDoc = doc_2
		if(!_.isObject(LogicUtils.getAllianceMemberById(defenceAllianceDoc, defencePlayerId))) return Promise.reject(new Error("玩家不在敌对联盟中"))
		updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, defencePlayerDoc._id])
		var event = MarchUtils.createStrikePlayerCityMarchEvent(attackPlayerDoc, attackAllianceDoc, attackPlayerDoc.dragons[dragonType], defencePlayerDoc, defenceAllianceDoc)
		attackAllianceDoc.strikeMarchEvents.push(event)
		attackAllianceData.__strikeMarchEvents = [{
			type:Consts.DataChangedType.Add,
			data:event
		}]
		eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "strikeMarchEvents", event.id, event.arriveTime])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, attackAllianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc, attackAllianceData])
		LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(attackPlayerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
		}
		if(_.isObject(attackAllianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(attackAllianceDoc._id))
		}
		if(_.isObject(defencePlayerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(defencePlayerDoc._id))
		}
		if(_.isObject(defenceAllianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(defenceAllianceDoc._id))
		}
		if(funcs.length > 0){
			Promise.all(funcs).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 进攻玩家城市
 * @param playerId
 * @param enemyPlayerId
 * @param callback
 */
pro.attackPlayerCity = function(playerId, enemyPlayerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(enemyPlayerId)){
		callback(new Error("enemyPlayerId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var enemyPlayerDoc = null
	var allianceDoc = null
	var allianceData = {}
	var enemyAllianceDoc = null
	var enemyAllianceData = {}
	var playerTroop = null
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("联盟不存在"))
		allianceDoc = doc
		if(!_.isEqual(allianceDoc.basicInfo.status, Consts.AllianceStatus.Fight)){
			return Promise.reject(new Error("联盟未处于战争期"))
		}
		if(!_.isEqual(allianceDoc.moonGateData.moonGateOwner, Consts.AllianceMoonGateOwner.Our)){
			return Promise.reject(new Error("占领月门后才能进攻玩家城市"))
		}
		playerTroop = _.find(allianceDoc.moonGateData.ourTroops, function(troop){
			return _.isEqual(troop.id, playerId)
		})
		if(!_.isObject(playerTroop)) return Promise.reject(new Error("玩家没有部队驻扎在月门"))
		var funcs = []
		funcs.push(self.allianceDao.findByIdAsync(allianceDoc.moonGateData.enemyAlliance.id))
		funcs.push(self.playerDao.findByIdAsync(enemyPlayerId))
		return Promise.all(funcs)
	}).spread(function(doc_1, doc_2){
		if(!_.isObject(doc_1)) return Promise.reject(new Error("联盟不存在"))
		enemyAllianceDoc = doc_1
		if(!_.isObject(doc_2)) return Promise.reject(new Error("玩家不存在"))
		enemyPlayerDoc = doc_2
		if(!_.isObject(LogicUtils.getAllianceMemberById(enemyAllianceDoc, enemyPlayerId))) return Promise.reject(new Error("玩家不在敌对联盟中"))

		var event = LogicUtils.createAttackPlayerCityMarchEvent(playerDoc, playerTroop, enemyAllianceDoc, enemyPlayerDoc)
		allianceDoc.attackCityMarchEvents.push(event)
		enemyAllianceDoc.cityBeAttackedMarchEvents.push(event)
		eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, allianceDoc, "attackCityMarchEvents", event.id, event.arriveTime])
		allianceData.__attackCityMarchEvents = [{
			type:Consts.DataChangedType.Add,
			data:event
		}]
		enemyAllianceData.__cityBeAttackedMarchEvents = [{
			type:Consts.DataChangedType.Add,
			data:event
		}]
		LogicUtils.removeItemInArray(allianceDoc.moonGateData.ourTroops, playerTroop)
		allianceData.moonGateData = {}
		allianceData.moonGateData.__ourTroops = [{
			type:Consts.DataChangedType.Remove,
			data:playerTroop
		}]

		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, enemyPlayerDoc._id])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, enemyAllianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, enemyAllianceDoc._id, enemyAllianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(_.isObject(enemyPlayerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(enemyPlayerDoc._id))
		}
		if(_.isObject(allianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(allianceDoc._id))
		}
		if(_.isObject(enemyAllianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(enemyAllianceDoc._id))
		}
		if(funcs.length > 0){
			Promise.all(funcs).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 侦查村落
 * @param playerId
 * @param dragonType
 * @param targetAllianceId
 * @param targetVillageId
 * @param callback
 */
pro.strikeVillage = function(playerId, dragonType, targetAllianceId, targetVillageId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!DataUtils.isDragonTypeExist(dragonType)){
		callback(new Error("dragonType 不合法"))
		return
	}
	if(!_.isString(targetAllianceId)){
		callback(new Error("targetAllianceId 不合法"))
		return
	}
	if(!_.isString(targetVillageId)){
		callback(new Error("targetVillageId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var playerData = {}
	var enemyPlayerDoc = null
	var enemyPlayerData = {}
	var allianceDoc = null
	var allianceData = {}
	var enemyAllianceDoc = null
	var enemyAllianceData = {}
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []

	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
		playerDoc = doc
		var dragon = playerDoc.dragons[dragonType]
		if(dragon.star <= 0) return Promise.reject(new Error("龙还未孵化"))
		if(!_.isEqual(Consts.DragonStatus.Free, dragon.status)) return Promise.reject(new Error("龙未处于空闲状态"))
		if(dragon.hp == 0) return Promise.reject(new Error("所选择的龙已经阵亡"))
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("联盟不存在"))
		allianceDoc = doc
		if(!_.isEqual(allianceDoc._id, targetAllianceId)){
			if(!_.isEqual(allianceDoc.basicInfo.status, Consts.AllianceStatus.Fight)){
				return Promise.reject(new Error("联盟未处于战争期"))
			}
			if(!_.isEqual(allianceDoc.moonGateData.moonGateOwner, Consts.AllianceMoonGateOwner.Our)){
				return Promise.reject(new Error("占领月门后才能突袭敌方村落"))
			}
			if(!_.isEqual(allianceDoc.moonGateData.enemyAlliance.id, targetAllianceId)){
				return Promise.reject(new Error("目标联盟非敌对联盟或我方联盟"))
			}
		}

		var funcs = []
		funcs.push(self.allianceDao.findByIdAsync(allianceDoc.moonGateData.enemyAlliance.id))
		funcs.push(self.playerDao.findByIdAsync(enemyPlayerId))
		return Promise.all(funcs)
	}).spread(function(doc_1, doc_2){
		if(!_.isObject(doc_1)) return Promise.reject(new Error("联盟不存在"))
		enemyAllianceDoc = doc_1
		if(!_.isObject(doc_2)) return Promise.reject(new Error("玩家不存在"))
		enemyPlayerDoc = doc_2
		if(!_.isObject(LogicUtils.getAllianceMemberById(enemyAllianceDoc, enemyPlayerId))) return Promise.reject(new Error("玩家不在敌对联盟中"))

		LogicUtils.refreshPlayerResources(enemyPlayerDoc)
		var playerDragon = playerDoc.dragons[dragonType]
		var enemyPlayerDragon = LogicUtils.getPlayerDefenceDragon(enemyPlayerDoc)
		var params = ReportUtils.createDragonStrikeCityReport(playerDoc, playerDragon, enemyAllianceDoc, enemyPlayerDoc, enemyPlayerDragon)
		var reportForPlayer = params.reportForPlayer
		var reportForEnemyPlayer = params.reportForEnemyPlayer
		var strikeReport = reportForPlayer.strikeCity
		playerDragon.hp -= strikeReport.playerData.dragon.hpDecreased
		playerDoc.resources.coin += strikeReport.playerData.coinGet
		playerData.resources = playerDoc.resources
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDragon
		playerData.__reports = []
		var willRemovedReport = null
		if(playerDoc.reports.length >= Define.PlayerReportsMaxSize){
			willRemovedReport = LogicUtils.getPlayerFirstUnSavedReport(playerDoc)
			LogicUtils.removeItemInArray(playerDoc.reports, willRemovedReport)
			playerData.__reports.push({
				type:Consts.DataChangedType.Remove,
				data:willRemovedReport
			})
			if(!!willRemovedReport.isSaved){
				playerData.__savedReports = [{
					type:Consts.DataChangedType.Remove,
					data:willRemovedReport
				}]
			}
		}
		playerDoc.reports.push(reportForPlayer)
		playerData.__reports.push({
			type:Consts.DataChangedType.Add,
			data:reportForPlayer
		})
		enemyPlayerDoc.resources.coin -= strikeReport.playerData.coinGet
		enemyPlayerData.basicInfo = enemyPlayerDoc.basicInfo
		enemyPlayerData.resources = enemyPlayerDoc.resources
		if(_.isObject(enemyPlayerDragon)){
			enemyPlayerDragon.hp -= strikeReport.enemyPlayerData.dragon.hpDecreased
			if(enemyPlayerDragon.hp == 0) enemyPlayerDragon.status = Consts.DragonStatus.Free
			enemyPlayerData.dragons = []
			enemyPlayerData.dragons[dragonType] = enemyPlayerDragon
		}
		enemyPlayerData.__reports = []
		if(enemyPlayerDoc.reports.length >= Define.PlayerReportsMaxSize){
			willRemovedReport = LogicUtils.getPlayerFirstUnSavedReport(enemyPlayerDoc)
			LogicUtils.removeItemInArray(enemyPlayerDoc.reports, willRemovedReport)
			enemyPlayerData.__reports.push({
				type:Consts.DataChangedType.Remove,
				data:willRemovedReport
			})
			if(!!willRemovedReport.isSaved){
				enemyPlayerData.__savedReports = [{
					type:Consts.DataChangedType.Remove,
					data:willRemovedReport
				}]
			}
		}
		enemyPlayerDoc.reports.push(reportForEnemyPlayer)
		enemyPlayerData.__reports.push({
			type:Consts.DataChangedType.Add,
			data:reportForEnemyPlayer
		})
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, enemyPlayerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, enemyPlayerDoc, enemyPlayerData])

		allianceDoc.moonGateData.countData.our.strikeCount += 1
		enemyAllianceDoc.moonGateData.countData.enemy.strikeCount += 1
		allianceData.moonGateData = {}
		allianceData.moonGateData.countData = {}
		allianceData.moonGateData.countData.our = allianceDoc.moonGateData.countData.our
		enemyAllianceData.moonGateData = {}
		enemyAllianceData.moonGateData.countData = {}
		enemyAllianceData.moonGateData.countData.our = enemyAllianceDoc.moonGateData.countData.our
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, enemyAllianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, enemyAllianceDoc._id, enemyAllianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(eventFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(_.isObject(enemyPlayerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(enemyPlayerDoc._id))
		}
		if(_.isObject(allianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(allianceDoc._id))
		}
		if(_.isObject(enemyAllianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(enemyAllianceDoc._id))
		}
		if(funcs.length > 0){
			Promise.all(funcs).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}