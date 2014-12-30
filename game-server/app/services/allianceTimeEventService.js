"use strict"

/**
 * Created by modun on 14-10-28.
 */

var ShortId = require("shortid")
var Promise = require("bluebird")
var _ = require("underscore")
var crypto = require("crypto")

var CommonUtils = require("../utils/utils")
var NodeUtils = require("util")
var Utils = require("../utils/utils")
var DataUtils = require("../utils/dataUtils")
var LogicUtils = require("../utils/logicUtils")
var MarchUtils = require("../utils/marchUtils")
var FightUtils = require("../utils/fightUtils")
var ReportUtils = require("../utils/reportUtils")
var Events = require("../consts/events")
var Consts = require("../consts/consts")
var Define = require("../consts/define")
var Localizations = require("../consts/localizations")

var AllianceTimeEventService = function(app){
	this.app = app
	this.env = app.get("env")
	this.pushService = app.get("pushService")
	this.globalChannelService = app.get("globalChannelService")
	this.timeEventService = app.get("timeEventService")
	this.allianceDao = app.get("allianceDao")
	this.playerDao = app.get("playerDao")
}
module.exports = AllianceTimeEventService
var pro = AllianceTimeEventService.prototype

/**
 * 创建调用返回
 * @param updateFuncs
 * @param eventFuncs
 * @param pushFuncs
 * @returns {{updateFuncs: *, eventFuncs: *, pushFuncs: *}}
 * @constructor
 */
var CreateResponse = function(updateFuncs, eventFuncs, pushFuncs){
	var response = {
		updateFuncs:updateFuncs,
		eventFuncs:eventFuncs,
		pushFuncs:pushFuncs
	}
	return response
}

/**
 * 到达指定时间时,触发的消息
 * @param allianceId
 * @param eventType
 * @param eventId
 * @param callback
 */
pro.onTimeEvent = function(allianceId, eventType, eventId, callback){
	var self = this
	var allianceDoc = null
	var event = null
	var pushFuncs = []
	var updateFuncs = []
	var eventFuncs = []
	this.allianceDao.findByIdAsync(allianceId, true).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		if(_.isEqual(eventType, Consts.AllianceStatusEvent)){
			allianceDoc.basicInfo.status = Consts.AllianceStatus.Peace
			allianceDoc.basicInfo.statusStartTime = Date.now()
			allianceDoc.basicInfo.statusFinishTime = 0
			allianceDoc.allianceFight = null
			var allianceData = {}
			allianceData.basicInfo = allianceDoc.basicInfo
			allianceData.allianceFight = {}
			updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc, true])
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
			return Promise.resolve()
		}else{
			updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
			event = LogicUtils.getEventById(allianceDoc[eventType], eventId)
			if(!_.isObject(event)){
				return Promise.reject(new Error("联盟事件不存在"))
			}
			var timeEventFuncName = "on" + eventType.charAt(0).toUpperCase() + eventType.slice(1) + "Async"
			if(!_.isObject(self[timeEventFuncName])) return Promise.reject(new Error("未知的事件类型"))
			return self[timeEventFuncName](allianceDoc, event).then(function(params){
				updateFuncs = updateFuncs.concat(params.updateFuncs)
				eventFuncs = eventFuncs.concat(params.eventFuncs)
				pushFuncs = pushFuncs.concat(params.pushFuncs)
				return Promise.resolve()
			})
		}
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
 * 到达指定时间时,联盟战斗触发的消息
 * @param ourAllianceId
 * @param enemyAllianceId
 * @param callback
 */
pro.onFightTimeEvent = function(ourAllianceId, enemyAllianceId, callback){
	var self = this
	var attackAllianceDoc = null
	var defenceAllianceDoc = null
	var pushFuncs = []
	var updateFuncs = []
	var eventFuncs = []
	var funcs = []
	funcs.push(this.allianceDao.findByIdAsync(ourAllianceId, true))
	funcs.push(this.allianceDao.findByIdAsync(enemyAllianceId, true))
	Promise.all(funcs).spread(function(doc_1, doc_2){
		if(!_.isObject(doc_1)){
			return Promise.reject(new Error("联盟不存在"))
		}
		attackAllianceDoc = doc_1
		if(!_.isObject(doc_2)){
			return Promise.reject(new Error("联盟不存在"))
		}
		defenceAllianceDoc = doc_2
		if(_.isEqual(attackAllianceDoc.basicInfo.status, Consts.AllianceStatus.Prepare)){
			return self.onAllianceFightPrepareAsync(attackAllianceDoc, defenceAllianceDoc)
		}else if(_.isEqual(attackAllianceDoc.basicInfo.status, Consts.AllianceStatus.Fight)){
			return self.onAllianceFightFightingAsync(attackAllianceDoc, defenceAllianceDoc)
		}else{
			return Promise.reject(new Error("非法的联盟状态"))
		}
	}).then(function(params){
		updateFuncs = updateFuncs.concat(params.updateFuncs)
		eventFuncs = eventFuncs.concat(params.eventFuncs)
		pushFuncs = pushFuncs.concat(params.pushFuncs)
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
		if(_.isObject(attackAllianceDoc)){
			funcs.push(self.allianceDao.removeLockByIdAsync(attackAllianceDoc._id))
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
 * 进攻行军事件回调
 * @param allianceDoc
 * @param event
 * @param callback
 */
pro.onAttackMarchEvents = function(allianceDoc, event, callback){
	var self = this
	var attackAllianceDoc = allianceDoc
	var attackAllianceData = {}
	var attackPlayerDoc = null
	var attackPlayerData = {}
	var defenceAllianceDoc = null
	var defenceAllianceData = {}
	var defencePlayerDoc = null
	var defencePlayerData = {}
	var helpDefencePlayerDoc = null
	var helpDefencePlayerData = {}
	var attackDragon = null
	var attackDragonForFight = null
	var attackSoldiersForFight = null
	var helpDefenceDragon = null
	var helpDefenceDragonForFight = null
	var helpDefenceSoldiersForFight = null
	var defenceDragon = null
	var defenceDragonForFight = null
	var defenceSoldiersForFight = null
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []
	var funcs = []

	LogicUtils.removeItemInArray(attackAllianceDoc.attackMarchEvents, event)
	attackAllianceData.__attackMarchEvents = [{
		type:Consts.DataChangedType.Remove,
		data:event
	}]

	if(_.isEqual(event.marchType, Consts.AllianceMarchType.Shrine)){
		var shrineEvent = LogicUtils.getEventById(attackAllianceDoc.shrineEvents, event.defenceShrineData.shrineEventId)
		if(!_.isObject(shrineEvent)){
			this.playerDao.findByIdAsync(event.attackPlayerData.id, true).then(function(doc){
				if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
				attackPlayerDoc = doc
				var marchReturnEvent = MarchUtils.createAttackAllianceShrineMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, event.attackPlayerData.dragon, event.attackPlayerData.soldiers, [], [])
				attackAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
				attackAllianceData.__attackMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:marchReturnEvent
				}]
				updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, attackPlayerDoc._id])
				eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				return Promise.resolve()
			}).then(function(){
				callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
			}).catch(function(e){
				funcs = []
				if(_.isObject(attackPlayerDoc)){
					funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
				}
				if(funcs.length > 0){
					Promise.all(funcs).then(function(){
						callback(e)
					})
				}else{
					callback(e)
				}
			})
		}else{
			var playerTroop = {
				id:event.attackPlayerData.id,
				name:event.attackPlayerData.name,
				cityName:event.attackPlayerData.cityName,
				location:event.attackPlayerData.location,
				dragon:event.attackPlayerData.dragon,
				soldiers:event.attackPlayerData.soldiers
			}
			shrineEvent.playerTroops.push(playerTroop)
			attackAllianceData.__shrineEvents = [{
				type:Consts.DataChangedType.Edit,
				data:shrineEvent
			}]
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
			LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
			callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
		}
		return
	}
	if(_.isEqual(event.marchType, Consts.AllianceMarchType.HelpDefence)){
		funcs = []
		funcs.push(this.playerDao.findByIdAsync(event.attackPlayerData.id, true))
		funcs.push(this.playerDao.findByIdAsync(event.defencePlayerData.id, true))
		Promise.all(funcs).spread(function(doc_1, doc_2){
			if(!_.isObject(doc_1)) return Promise.reject(new Error("玩家不存在"))
			if(!_.isObject(doc_2)) return Promise.reject(new Error("玩家不存在"))
			attackPlayerDoc = doc_1
			defencePlayerDoc = doc_2

			var helpToTroop = {
				playerDragon:event.attackPlayerData.dragon.type,
				beHelpedPlayerData:{
					id:defencePlayerDoc._id,
					name:defencePlayerDoc.basicInfo.name,
					cityName:defencePlayerDoc.basicInfo.cityName
				}
			}
			attackPlayerDoc.helpToTroops.push(helpToTroop)
			attackPlayerData.__helpToTroops = [{
				type:Consts.DataChangedType.Add,
				data:helpToTroop
			}]
			var helpedByTroop = {
				id:attackPlayerDoc._id,
				name:attackPlayerDoc.basicInfo.name,
				level:attackPlayerDoc.basicInfo.level,
				cityName:attackPlayerDoc.basicInfo.cityName,
				dragon:{
					type:event.attackPlayerData.dragon.type
				},
				soldiers:event.attackPlayerData.soldiers,
				woundedSoldiers:[],
				rewards:[]
			}
			defencePlayerDoc.helpedByTroops.push(helpedByTroop)
			defencePlayerData.__helpedByTroops = [{
				type:Consts.DataChangedType.Add,
				data:helpedByTroop
			}]
			var beHelpedMemberInAlliance = LogicUtils.getAllianceMemberById(attackAllianceDoc, defencePlayerDoc._id)
			beHelpedMemberInAlliance.helpedByTroopsCount += 1
			attackAllianceData.__members = [{
				type:Consts.DataChangedType.Edit,
				data:beHelpedMemberInAlliance
			}]
			updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
			updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
			LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
			return Promise.resolve()
		}).then(function(){
			callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
		}).catch(function(e){
			funcs = []
			if(_.isObject(attackPlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
			}
			if(_.isObject(defencePlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(defencePlayerDoc._id))
			}
			if(funcs.length > 0){
				Promise.all(funcs).then(function(){
					callback(e)
				})
			}else{
				callback(e)
			}
		})
		return
	}
	if(_.isEqual(event.marchType, Consts.AllianceMarchType.City)){
		var updateDragonForFight = function(dragonForFight, dragonAfterFight){
			dragonForFight.currentHp = dragonAfterFight.currentHp
		}
		var updateSoldiersForFight = function(soldiersForFight, soldiersAfterFight){
			_.each(soldiersAfterFight, function(soldierAfterFight){
				var soldierForFight = _.find(soldiersForFight, function(soldierForFight){
					return _.isEqual(soldierForFight.name, soldierAfterFight.name)
				})
				soldierForFight.currentCount = soldierAfterFight.currentCount
				soldierForFight.woundedCount += soldierAfterFight.woundedCount
				soldierForFight.killedSoldiers = soldierForFight.killedSoldiers.concat(soldierAfterFight.killedSoldiers)
			})
		}
		var getSoldiersFromSoldiersForFight = function(soldiersForFight){
			var soldiers = []
			_.each(soldiersForFight, function(soldierForFight){
				if(soldierForFight.currentCount > 0){
					var soldier = {
						name:soldierForFight.name,
						count:soldierForFight.currentCount
					}
					soldiers.push(soldier)
				}
			})
			return soldiers
		}
		var getWoundedSoldiersFromSoldiersForFight = function(soldiersForFight){
			var soldiers = []
			_.each(soldiersForFight, function(soldierForFight){
				if(soldierForFight.woundedCount > 0){
					var soldier = {
						name:soldierForFight.name,
						count:soldierForFight.woundedCount
					}
					soldiers.push(soldier)
				}
			})
			return soldiers
		}
		var updateWallForFight = function(wallForFight, wallAfterFight){
			wallForFight.currentHp = wallAfterFight.currentHp
		}
		var createNewSoldiersForFight = function(soldiersForFight){
			var newSoldiersForFight = []
			_.each(soldiersForFight, function(soldierForFight){
				if(soldierForFight.currentCount >= 0){
					var newSoldierForFight = CommonUtils.clone(soldierForFight)
					newSoldierForFight.totalCount = soldierForFight.currentCount
					newSoldierForFight.woundedCount = 0
					newSoldierForFight.morale = 100
					newSoldierForFight.round = 0
					newSoldierForFight.killedSoldiers = []
					newSoldiersForFight.push(newSoldierForFight)
				}
			})
			return newSoldiersForFight
		}
		var updatePlayerKillData = function(playerKillDatas, playerId, playerName, newlyKill){
			var isNew = false
			var playerKillData = _.find(playerKillDatas, function(playerKillData){
				return _.isEqual(playerKillData.id, playerId)
			})
			if(!_.isObject(playerKillData)){
				playerKillData = {
					id:playerId,
					name:playerName,
					kill:0
				}
				playerKillDatas.push(playerKillData)
				isNew = true
			}
			playerKillData.kill += newlyKill

			return {data:playerKillData, isNew:isNew}
		}
		var updatePlayerSoldiers = function(playerDoc, soldiersForFight, playerData){
			if(!_.isObject(playerData.soldiers)) playerData.soldiers = {}
			_.each(soldiersForFight, function(soldierForFight){
				if(soldierForFight.totalCount > soldierForFight.currentCount){
					playerDoc.soldiers[soldierForFight.name] -= soldierForFight.totalCount - soldierForFight.currentCount
					playerData.soldiers[soldierForFight.name] = playerDoc.soldiers[soldierForFight.name]
				}
			})
		}
		var updatePlayerWoundedSoldiers = function(playerDoc, soldiersForFight, playerData){
			if(!_.isObject(playerData.woundedSoldiers)) playerData.woundedSoldiers = {}
			_.each(soldiersForFight, function(soldierForFight){
				if(soldierForFight.woundedCount > 0){
					playerDoc.woundedSoldiers[soldierForFight.name] += soldierForFight.woundedCount
					playerData.woundedSoldiers[soldierForFight.name] = playerDoc.woundedSoldiers[soldierForFight.name]
				}
			})
		}

		var attackTreatSoldierPercent = null
		var helpDefenceTreatSoldierPercent = null
		var helpDefenceDragonFightFixEffect = null
		var defenceTreatSoldierPercent = null
		var defenceDragonFightFixEffect = null
		var defenceWallForFight = null
		var helpDefenceDragonFightData = null
		var helpDefenceSoldierFightData = null
		var defenceDragonFightData = null
		var defenceSoldierFightData = null
		var defenceWallFightData = null
		var attackCityReport = null
		var helpedByTroop = null
		var theDefencePlayerDoc = null

		funcs = []
		funcs.push(self.playerDao.findByIdAsync(event.attackPlayerData.id, true))
		funcs.push(self.allianceDao.findByIdAsync(event.defencePlayerData.alliance.id, true))
		funcs.push(self.playerDao.findByIdAsync(event.defencePlayerData.id, true))
		Promise.all(funcs).spread(function(doc_1, doc_2, doc_3){
			if(!_.isObject(doc_1)) return Promise.reject(new Error("玩家不存在"))
			attackPlayerDoc = doc_1
			if(!_.isObject(doc_2)) return Promise.reject(new Error("联盟不存在"))
			defenceAllianceDoc = doc_2
			if(!_.isObject(doc_3)) return Promise.reject(new Error("玩家不存在"))
			defencePlayerDoc = doc_3
			if(defencePlayerDoc.helpedByTroops.length > 0){
				return self.playerDao.findByIdAsync(defencePlayerDoc.helpedByTroops[0].id)
			}
			LogicUtils.refreshPlayerResources(defencePlayerDoc)
			defencePlayerData.resources = defencePlayerDoc.resources
			defencePlayerData.basicInfo = defencePlayerDoc.basicInfo
			return Promise.resolve()
		}).then(function(doc){
			if(defencePlayerDoc.helpedByTroops.length > 0){
				if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
				helpDefencePlayerDoc = doc
			}

			attackDragon = attackPlayerDoc.dragons[event.attackPlayerData.dragon.type]
			attackDragonForFight = DataUtils.createPlayerDragonForFight(attackPlayerDoc, attackDragon)
			attackSoldiersForFight = DataUtils.createPlayerSoldiersForFight(attackPlayerDoc, event.attackPlayerData.soldiers)
			attackTreatSoldierPercent = DataUtils.getPlayerDamagedSoldierToWoundedSoldierPercent(attackPlayerDoc)
			if(_.isObject(helpDefencePlayerDoc)){
				helpedByTroop = defencePlayerDoc.helpedByTroops[0]
				helpDefenceDragon = helpDefencePlayerDoc.dragons[helpedByTroop.dragon.type]
				helpDefenceDragonForFight = DataUtils.createPlayerDragonForFight(helpDefencePlayerDoc, helpDefenceDragon)
				helpDefenceSoldiersForFight = DataUtils.createPlayerSoldiersForFight(helpDefencePlayerDoc, helpedByTroop.soldiers)
				helpDefenceTreatSoldierPercent = DataUtils.getPlayerDamagedSoldierToWoundedSoldierPercent(helpDefencePlayerDoc)
				helpDefenceDragonFightFixEffect = DataUtils.getDragonFightFixedEffect(attackSoldiersForFight, helpDefenceSoldiersForFight)
			}
			defenceDragon = LogicUtils.getPlayerDefenceDragon(defencePlayerDoc)
			var defenceSoldiers = DataUtils.getPlayerDefenceSoldiers(defencePlayerDoc)
			if(_.isObject(defenceDragon) && defenceSoldiers.length > 0){
				defenceDragonForFight = DataUtils.createPlayerDragonForFight(defencePlayerDoc, defenceDragon)
				defenceSoldiersForFight = DataUtils.createPlayerSoldiersForFight(defencePlayerDoc, defenceSoldiers)
				defenceTreatSoldierPercent = DataUtils.getPlayerDamagedSoldierToWoundedSoldierPercent(defencePlayerDoc)
				defenceDragonFightFixEffect = DataUtils.getDragonFightFixedEffect(attackSoldiersForFight, defenceSoldiersForFight)
			}
			if(defencePlayerDoc.resources.wallHp > 0){
				defenceWallForFight = DataUtils.createPlayerWallForFight(defencePlayerDoc)
			}
			return Promise.resolve()
		}).then(function(){
			if(_.isObject(helpDefencePlayerDoc)){
				helpDefenceDragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, helpDefenceDragonForFight, helpDefenceDragonFightFixEffect)
				helpDefenceSoldierFightData = FightUtils.soldierToSoldierFight(attackSoldiersForFight, attackTreatSoldierPercent, helpDefenceSoldiersForFight, helpDefenceTreatSoldierPercent)
				updateDragonForFight(attackDragonForFight, helpDefenceDragonFightData.attackDragonAfterFight)
				updateSoldiersForFight(attackSoldiersForFight, helpDefenceSoldierFightData.attackSoldiersAfterFight)
				updateDragonForFight(helpDefenceDragonForFight, helpDefenceDragonFightData.defenceDragonAfterFight)
				updateSoldiersForFight(helpDefenceSoldiersForFight, helpDefenceSoldierFightData.defenceSoldiersAfterFight)
				return Promise.resolve()
			}
			if(_.isObject(defenceDragonForFight)){
				defenceDragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, defenceDragonForFight, defenceDragonFightFixEffect)
				defenceSoldierFightData = FightUtils.soldierToSoldierFight(attackSoldiersForFight, attackTreatSoldierPercent, defenceSoldiersForFight, defenceTreatSoldierPercent)
				updateDragonForFight(attackDragonForFight, defenceDragonFightData.attackDragonAfterFight)
				updateSoldiersForFight(attackSoldiersForFight, defenceSoldierFightData.attackSoldiersAfterFight)
				updateDragonForFight(defenceDragonForFight, defenceDragonFightData.defenceDragonAfterFight)
				updateSoldiersForFight(defenceSoldiersForFight, defenceSoldierFightData.defenceSoldiersAfterFight)
				if(_.isEqual(Consts.FightResult.DefenceWin, defenceSoldierFightData.fightResult)){
					return Promise.resolve()
				}
			}
			if(_.isObject(defenceWallForFight)){
				var attackSoldiersForFight_1 = _.isObject(defenceDragonForFight) ? createNewSoldiersForFight(attackSoldiersForFight) : attackSoldiersForFight
				defenceWallFightData = FightUtils.soldierToWallFight(attackSoldiersForFight_1, attackTreatSoldierPercent, defenceWallForFight)
				updateSoldiersForFight(attackSoldiersForFight, defenceWallFightData.attackSoldiersAfterFight)
				updateWallForFight(defenceWallForFight, defenceWallFightData.defenceWallAfterFight)
				return Promise.resolve()
			}
			return Promise.resolve()
		}).then(function(){
			var report = null
			if(_.isObject(helpDefencePlayerDoc)){
				report = ReportUtils.createAttackCityFightWithHelpDefencePlayerReport(attackAllianceDoc, attackPlayerDoc, defenceAllianceDoc, defencePlayerDoc, helpDefencePlayerDoc, helpDefenceDragonFightData, helpDefenceSoldierFightData)
			}else{
				report = ReportUtils.createAttackCityFightWithDefencePlayerReport(attackAllianceDoc, attackPlayerDoc, attackDragonForFight, defenceAllianceDoc, defencePlayerDoc, defenceDragonFightData, defenceSoldierFightData, defenceWallFightData)
			}
			attackCityReport = report.report.attackCity
			var countData = report.countData
			//console.log(NodeUtils.inspect(report, false, null))

			attackPlayerDoc.basicInfo.kill += countData.attackPlayerKill
			DataUtils.updatePlayerDragonProperty(attackPlayerDoc, attackPlayerDoc.dragons[attackDragon.type], attackDragonForFight.totalHp - attackDragonForFight.currentHp, countData.attackDragonExpAdd)
			attackPlayerData.basicInfo = attackPlayerDoc.basicInfo
			attackPlayerData.dragons = {}
			attackPlayerData.dragons[attackDragon.type] = attackPlayerDoc.dragons[attackDragon.type]

			LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report.report)

			var attackCityMarchReturnEvent = MarchUtils.createAttackPlayerCityMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragonForFight, getSoldiersFromSoldiersForFight(attackSoldiersForFight), getWoundedSoldiersFromSoldiersForFight(attackSoldiersForFight), defenceAllianceDoc, defencePlayerDoc, attackCityReport.attackPlayerData.rewards)
			eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "attackMarchReturnEvents", attackCityMarchReturnEvent.id, attackCityMarchReturnEvent.arriveTime])
			attackAllianceDoc.attackMarchReturnEvents.push(attackCityMarchReturnEvent)
			attackAllianceData.__attackMarchReturnEvents = [{
				type:Consts.DataChangedType.Add,
				data:attackCityMarchReturnEvent
			}]
			updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])

			if(_.isObject(helpDefenceDragonFightData)){
				theDefencePlayerDoc = helpDefencePlayerDoc

				helpDefencePlayerDoc.basicInfo.kill += countData.defencePlayerKill
				DataUtils.updatePlayerDragonProperty(helpDefencePlayerDoc, helpDefencePlayerDoc.dragons[helpDefenceDragon.type], helpDefenceDragonForFight.totalHp - helpDefenceDragonForFight.currentHp, countData.defenceDragonExpAdd)
				helpDefencePlayerData.basicInfo = helpDefencePlayerDoc.basicInfo
				helpDefencePlayerData.dragons = {}
				helpDefencePlayerData.dragons[helpDefenceDragon.type] = helpDefencePlayerDoc.dragons[helpDefenceDragon.type]

				LogicUtils.addPlayerReport(helpDefencePlayerDoc, helpDefencePlayerData, report.report)
				var helpDefenceMailTitle = Localizations.Alliance.HelpDefenceAttackTitle
				var helpDefenceMailContent = Localizations.Alliance.HelpDefenceAttackContent
				var helpDefenceMailParams = [helpDefencePlayerDoc.basicInfo.name, defenceAllianceDoc.basicInfo.tag]
				LogicUtils.sendSystemMail(defencePlayerDoc, defencePlayerData, helpDefenceMailTitle, helpDefenceMailParams, helpDefenceMailContent, helpDefenceMailParams)

				helpedByTroop.soldiers = getSoldiersFromSoldiersForFight(helpDefenceSoldierFightData.defenceSoldiersAfterFight)
				LogicUtils.mergeSoldiers(helpedByTroop.woundedSoldiers, getWoundedSoldiersFromSoldiersForFight(helpDefenceSoldiersForFight))
				LogicUtils.mergeRewards(helpedByTroop.rewards, attackCityReport.helpDefencePlayerData.rewards)
				LogicUtils.removeItemInArray(defencePlayerDoc.helpedByTroops, helpedByTroop)
				defencePlayerData.__helpedByTroops = [{
					type:Consts.DataChangedType.Remove,
					data:helpedByTroop
				}]
				var helpToTroop = _.find(helpDefencePlayerDoc.helpToTroops, function(troop){
					return _.isEqual(troop.beHelpedPlayerData.id, defencePlayerDoc._id)
				})
				LogicUtils.removeItemInArray(helpDefencePlayerDoc.helpToTroops, helpToTroop)
				helpDefencePlayerData.__helpToTroops = [{
					type:Consts.DataChangedType.Remove,
					data:helpToTroop
				}]
				var defencePlayerInAlliance = LogicUtils.getAllianceMemberById(defenceAllianceDoc, defencePlayerDoc._id)
				defencePlayerInAlliance.helpedByTroopsCount -= 1
				defenceAllianceData.__members = [{
					type:Consts.DataChangedType.Edit,
					data:defencePlayerInAlliance
				}]
				var helpDefenceMarchReturnEvent = MarchUtils.createHelpDefenceMarchReturnEvent(defenceAllianceDoc, helpDefencePlayerDoc, defencePlayerDoc, helpedByTroop.dragon, helpedByTroop.soldiers, helpedByTroop.woundedSoldiers, helpedByTroop.rewards)
				defenceAllianceDoc.attackMarchReturnEvents.push(helpDefenceMarchReturnEvent)
				defenceAllianceData.__attackMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:helpDefenceMarchReturnEvent
				}]

				eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, defenceAllianceDoc, "attackMarchReturnEvents", helpDefenceMarchReturnEvent.id, helpDefenceMarchReturnEvent.arriveTime])
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, helpDefencePlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, helpDefencePlayerDoc, helpDefencePlayerData])
			}else{
				theDefencePlayerDoc = defencePlayerDoc

				defencePlayerDoc.basicInfo.kill += countData.defencePlayerKill
				if(_.isObject(defenceDragonFightData)){
					DataUtils.updatePlayerDragonProperty(defencePlayerDoc, defencePlayerDoc.dragons[defenceDragon.type], defenceDragonForFight.totalHp - defenceDragonForFight.currentHp, countData.defenceDragonExpAdd)
					defencePlayerData.basicInfo = defencePlayerDoc.basicInfo
					defencePlayerData.dragons = {}
					defencePlayerData.dragons[defenceDragon.type] = defencePlayerDoc.dragons[defenceDragon.type]

					updatePlayerSoldiers(defencePlayerDoc, defenceSoldiersForFight, defencePlayerData)
					updatePlayerWoundedSoldiers(defencePlayerDoc, defenceSoldiersForFight, defencePlayerData)
				}
				if(_.isObject(defenceWallFightData)){
					defencePlayerDoc.resources.wallHp -= defenceWallForFight.totalHp - defenceWallForFight.currentHp
				}
				_.each(attackCityReport.defencePlayerData.rewards, function(reward){
					defencePlayerDoc[reward.type][reward.name] += reward.count
					if(!_.isObject(defencePlayerData[reward.type])) defencePlayerData[reward.type] = defencePlayerDoc[reward.type]
				})

				LogicUtils.addPlayerReport(defencePlayerDoc, defencePlayerData, report.report)
			}
			LogicUtils.refreshPlayerResources(defencePlayerDoc)
			defencePlayerData.basicInfo = defencePlayerDoc.basicInfo
			defencePlayerData.resources = defencePlayerDoc.resources
			updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])

			attackAllianceData.allianceFight = {}
			defenceAllianceData.allianceFight = {}
			var playerKillData = null
			if(_.isEqual(attackAllianceDoc._id, attackAllianceDoc.allianceFight.attackAllianceId)){
				attackAllianceDoc.allianceFight.attackAllianceCountData.attackCount += 1
				defenceAllianceDoc.allianceFight.attackAllianceCountData.attackCount += 1

				attackAllianceDoc.allianceFight.attackAllianceCountData.kill += countData.attackPlayerKill
				defenceAllianceDoc.allianceFight.attackAllianceCountData.kill += countData.attackPlayerKill
				playerKillData = updatePlayerKillData(attackAllianceDoc.allianceFight.attackPlayerKills, attackPlayerDoc._id, attackPlayerDoc.basicInfo.name, countData.attackPlayerKill)
				updatePlayerKillData(defenceAllianceDoc.allianceFight.attackPlayerKills, attackPlayerDoc._id, attackPlayerDoc.basicInfo.name, countData.attackPlayerKill)
				attackAllianceData.allianceFight.__attackPlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]
				defenceAllianceData.allianceFight.__attackPlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]

				attackAllianceDoc.allianceFight.defenceAllianceCountData.kill += countData.defencePlayerKill
				defenceAllianceDoc.allianceFight.defenceAllianceCountData.kill += countData.defencePlayerKill
				playerKillData = updatePlayerKillData(attackAllianceDoc.allianceFight.defencePlayerKills, theDefencePlayerDoc._id, theDefencePlayerDoc.basicInfo.name, countData.defencePlayerKill)
				updatePlayerKillData(defenceAllianceDoc.allianceFight.defencePlayerKills, theDefencePlayerDoc._id, theDefencePlayerDoc.basicInfo.name, countData.defencePlayerKill)
				attackAllianceData.allianceFight.__defencePlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]
				defenceAllianceData.allianceFight.__defencePlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]

				if(_.isObject(helpDefenceSoldierFightData)){
					if(_.isEqual(Consts.FightResult.AttackWin, helpDefenceSoldierFightData.fightResult)){
						attackAllianceDoc.allianceFight.attackAllianceCountData.attackSuccessCount += 1
						defenceAllianceDoc.allianceFight.attackAllianceCountData.attackSuccessCount += 1
					}
				}else{
					if(!_.isObject(defenceSoldierFightData) || _.isEqual(Consts.FightResult.AttackWin, defenceSoldierFightData.fightResult)){
						attackAllianceDoc.allianceFight.attackAllianceCountData.attackSuccessCount += 1
						defenceAllianceDoc.allianceFight.attackAllianceCountData.attackSuccessCount += 1
					}
					if(!_.isObject(defenceSoldierFightData) || _.isEqual(Consts.FightResult.AttackWin, defenceSoldierFightData.fightResult)){
						if(!_.isObject(defenceWallFightData) || _.isEqual(Consts.FightResult.AttackWin, defenceWallFightData.fightResult)){
							attackAllianceDoc.allianceFight.attackAllianceCountData.routCount += 1
							defenceAllianceDoc.allianceFight.attackAllianceCountData.routCount += 1
						}
					}
				}
			}else{
				attackAllianceDoc.allianceFight.defenceAllianceCountData.attackCount += 1
				defenceAllianceDoc.allianceFight.defenceAllianceCountData.attackCount += 1

				attackAllianceDoc.allianceFight.defenceAllianceCountData.kill += countData.attackPlayerKill
				defenceAllianceDoc.allianceFight.defenceAllianceCountData.kill += countData.attackPlayerKill
				playerKillData = updatePlayerKillData(attackAllianceDoc.allianceFight.defencePlayerKills, attackPlayerDoc._id, attackPlayerDoc.basicInfo.name, countData.attackPlayerKill)
				updatePlayerKillData(defenceAllianceDoc.allianceFight.defencePlayerKills, attackPlayerDoc._id, attackPlayerDoc.basicInfo.name, countData.attackPlayerKill)
				attackAllianceData.allianceFight.__defencePlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]
				defenceAllianceData.allianceFight.__defencePlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]

				attackAllianceDoc.allianceFight.attackAllianceCountData.kill += countData.defencePlayerKill
				defenceAllianceDoc.allianceFight.attackAllianceCountData.kill += countData.defencePlayerKill
				playerKillData = updatePlayerKillData(attackAllianceDoc.allianceFight.attackPlayerKills, theDefencePlayerDoc._id, theDefencePlayerDoc.basicInfo.name, countData.defencePlayerKill)
				updatePlayerKillData(defenceAllianceDoc.allianceFight.attackPlayerKills, theDefencePlayerDoc._id, theDefencePlayerDoc.basicInfo.name, countData.defencePlayerKill)
				attackAllianceData.allianceFight.__attackPlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]
				defenceAllianceData.allianceFight.__attackPlayerKills = [{
					type:playerKillData.isNew ? Consts.DataChangedType.Add : Consts.DataChangedType.Edit,
					data:playerKillData.data
				}]

				if(_.isObject(helpDefenceSoldierFightData)){
					if(_.isEqual(Consts.FightResult.AttackWin, helpDefenceSoldierFightData.fightResult)){
						attackAllianceDoc.allianceFight.defenceAllianceCountData.attackSuccessCount += 1
						defenceAllianceDoc.allianceFight.defenceAllianceCountData.attackSuccessCount += 1
					}
				}else{
					if(!_.isObject(defenceSoldierFightData)|| _.isEqual(Consts.FightResult.AttackWin, defenceSoldierFightData.fightResult)){
						attackAllianceDoc.allianceFight.defenceAllianceCountData.attackSuccessCount += 1
						defenceAllianceDoc.allianceFight.defenceAllianceCountData.attackSuccessCount += 1
					}
					if(!_.isObject(defenceSoldierFightData) || _.isEqual(Consts.FightResult.AttackWin, defenceSoldierFightData.fightResult)){
						if(!_.isObject(defenceWallFightData) || _.isEqual(Consts.FightResult.AttackWin, defenceWallFightData.fightResult)){
							attackAllianceDoc.allianceFight.defenceAllianceCountData.routCount += 1
							defenceAllianceDoc.allianceFight.defenceAllianceCountData.routCount += 1
						}
					}
				}
			}
			attackAllianceData.allianceFight.attackAllianceCountData = attackAllianceDoc.allianceFight.attackAllianceCountData
			attackAllianceData.allianceFight.defenceAllianceCountData = attackAllianceDoc.allianceFight.defenceAllianceCountData
			defenceAllianceData.allianceFight.attackAllianceCountData = defenceAllianceDoc.allianceFight.attackAllianceCountData
			defenceAllianceData.allianceFight.defenceAllianceCountData = defenceAllianceDoc.allianceFight.defenceAllianceCountData

			updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
			LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceData, defenceAllianceData)
			LogicUtils.putAllianceDataToEnemyAllianceData(defenceAllianceData, attackAllianceData)

			return Promise.resolve()
		}).then(function(){
			callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
		}).catch(function(e){
			funcs = []
			if(_.isObject(attackPlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
			}
			if(_.isObject(helpDefencePlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(helpDefencePlayerDoc._id))
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
		return
	}
	if(_.isEqual(event.marchType, Consts.AllianceMarchType.Village)){
		var createSoldiers = function(soldiersAfterFight){
			var soldiers = []
			_.each(soldiersAfterFight, function(soldierAfterFight){
				if(soldierAfterFight.currentCount > 0){
					var soldier = {
						name:soldierAfterFight.name,
						count:soldierAfterFight.currentCount
					}
					soldiers.push(soldier)
				}
			})
			return soldiers
		}
		var createWoundedSoldiers = function(soldiersAfterFight){
			var soldiers = []
			_.each(soldiersAfterFight, function(soldierAfterFight){
				if(soldierAfterFight.woundedCount > 0){
					var soldier = {
						name:soldierAfterFight.name,
						count:soldierAfterFight.woundedCount
					}
					soldiers.push(soldier)
				}
			})
			return soldiers
		}

		var villageEvent = null
		var village = null
		var targetAllianceDoc = null
		var targetAllianceData = null
		var report = null
		var countData = null
		var attackDragonExpAdd = null
		var attackPlayerKill = null
		var attackSoldiers = null
		var attackWoundedSoldiers = null
		var attackRewards = null
		var eventData = null
		var newVillageEvent = null
		var defenceDragonExpAdd = null
		var defencePlayerKill = null
		var defenceSoldiers = null
		var defenceWoundedSoldiers = null
		var defenceRewards = null
		var marchReturnEvent = null

		funcs = []
		funcs.push(self.playerDao.findByIdAsync(event.attackPlayerData.id, true))
		if(_.isObject(attackAllianceDoc.allianceFight)){
			var defenceAllianceId = _.isEqual(attackAllianceDoc._id, attackAllianceDoc.allianceFight.attackAllianceId) ? attackAllianceDoc.allianceFight.defenceAllianceId : attackAllianceDoc.allianceFight.attackAllianceId
			funcs.push(self.allianceDao.findByIdAsync(defenceAllianceId, true))
		}
		Promise.all(funcs).spread(function(doc_1, doc_2){
			if(!_.isObject(doc_1)) return Promise.reject(new Error("玩家不存在"))
			attackPlayerDoc = doc_1
			if(_.isObject(attackAllianceDoc.allianceFight)){
				if(!_.isObject(doc_2)) return Promise.reject(new Error("联盟不存在"))
				defenceAllianceDoc = doc_2
				defenceAllianceData = {}
				targetAllianceDoc = _.isEqual(event.defenceVillageData.alliance.id, attackAllianceDoc._id) ? attackAllianceDoc : defenceAllianceDoc
				targetAllianceData = _.isEqual(event.defenceVillageData.alliance.id, attackAllianceDoc._id) ? attackAllianceData : defenceAllianceData
			}else{
				targetAllianceDoc = attackAllianceDoc
				targetAllianceData = attackAllianceData
			}

			villageEvent = _.find(attackAllianceDoc.villageEvents, function(villageEvent){
				return _.isEqual(villageEvent.villageData.id, event.defenceVillageData.id)
			})
			if(!_.isObject(villageEvent) && _.isObject(defenceAllianceDoc)){
				villageEvent = _.find(defenceAllianceDoc.villageEvents, function(villageEvent){
					return _.isEqual(villageEvent.villageData.id, event.defenceVillageData.id)
				})
			}
			if(_.isObject(villageEvent)){
				return self.playerDao.findByIdAsync(villageEvent.playerData.id, true)
			}
			return Promise.resolve()
		}).then(function(doc){
			if(_.isObject(villageEvent)){
				if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
				defencePlayerDoc = doc
			}
			village = LogicUtils.getAllianceVillageById(targetAllianceDoc, event.defenceVillageData.id)
			if(!_.isObject(village)){
				var deletedVillage = {
					id:event.defenceVillageData.id,
					type:event.defenceVillageData.type,
					level:event.defenceVillageData.level,
					location:event.defenceVillageData.location
				}
				marchReturnEvent = MarchUtils.createAttackVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, event.attackPlayerData.dragon, event.attackPlayerData.soldiers, [], targetAllianceDoc, deletedVillage, [])
				attackAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
				attackAllianceData.__attackMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:marchReturnEvent
				}]
				updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, attackPlayerDoc._id])
				if(_.isObject(defenceAllianceDoc)){
					updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
				}
				eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				return Promise.resolve()
			}

			attackDragon = attackPlayerDoc.dragons[event.attackPlayerData.dragon.type]
			attackDragonForFight = DataUtils.createPlayerDragonForFight(attackPlayerDoc, attackDragon)
			attackSoldiersForFight = DataUtils.createPlayerSoldiersForFight(attackPlayerDoc, event.attackPlayerData.soldiers)
			attackTreatSoldierPercent = DataUtils.getPlayerDamagedSoldierToWoundedSoldierPercent(attackPlayerDoc)
			if(!_.isObject(villageEvent)){
				var villageDragon = {
					type:village.dragon.type,
					level:village.dragon.level,
					strength:DataUtils.getPlayerDragonStrength(null, village.dragon),
					vitality:DataUtils.getPlayerDragonVitality(null, village.dragon)
				}
				villageDragon.hp = DataUtils.getPlayerDragonHpMax(null, villageDragon)
				var villageDragonForFight = DataUtils.createPlayerDragonForFight(null, villageDragon)
				var villageSoldiersForFight = DataUtils.createPlayerSoldiersForFight(null, village.soldiers)
				var villageDragonFightFixEffect = DataUtils.getDragonFightFixedEffect(attackSoldiersForFight, villageSoldiersForFight)
				var villageDragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, villageDragonForFight, villageDragonFightFixEffect)
				var villageSoldierFightData = FightUtils.soldierToSoldierFight(attackSoldiersForFight, attackTreatSoldierPercent, villageSoldiersForFight, 0)

				report = ReportUtils.createAttackVillageFightWithVillageTroopReport(attackAllianceDoc, attackPlayerDoc, targetAllianceDoc, village, villageDragonFightData, villageSoldierFightData)
				countData = report.countData
				LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report.report)

				attackDragonExpAdd = countData.attackDragonExpAdd
				attackPlayerKill = countData.attackPlayerKill
				attackSoldiers = createSoldiers(villageSoldierFightData.attackSoldiersAfterFight)
				attackWoundedSoldiers = createWoundedSoldiers(villageSoldierFightData.attackSoldiersAfterFight)
				attackRewards = report.report.attackVillage.attackPlayerData.rewards

				attackPlayerDoc.basicInfo.kill += attackPlayerKill
				DataUtils.updatePlayerDragonProperty(attackPlayerDoc, attackPlayerDoc.dragons[attackDragon.type], villageDragonFightData.attackDragonHpDecreased, attackDragonExpAdd)
				attackPlayerData.basicInfo = attackPlayerDoc.basicInfo
				attackPlayerData.dragons = {}
				attackPlayerData.dragons[attackDragon.type] = attackPlayerDoc.dragons[attackDragon.type]
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])

				eventData = MarchUtils.createAllianceVillageEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, attackSoldiers, attackWoundedSoldiers, targetAllianceDoc, village, attackRewards)
				newVillageEvent = eventData.event
				if(newVillageEvent.villageData.resource <= newVillageEvent.villageData.collectTotal){
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "villageEvents", newVillageEvent.id, newVillageEvent.finishTime])
				}
				attackAllianceDoc.villageEvents.push(newVillageEvent)
				attackAllianceData.__villageEvents = [{
					type:Consts.DataChangedType.Add,
					data:newVillageEvent
				}]
				if(_.isObject(defenceAllianceDoc)){
					updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
				}
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				return Promise.resolve()
			}
			if(_.isEqual(attackPlayerDoc.alliance.id, defencePlayerDoc.alliance.id)){
				if(villageEvent.finishTime > Date.now()){
					marchReturnEvent = MarchUtils.createAttackVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, event.attackPlayerData.dragon, event.attackPlayerData.soldiers, [], targetAllianceDoc, village, [])
					attackAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
					attackAllianceData.__attackMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:marchReturnEvent
					}]
					updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, attackPlayerDoc._id])
					updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, defencePlayerDoc._id])
					if(_.isObject(defenceAllianceDoc)){
						updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
					}
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
					LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				}else if(villageEvent.villageData.resource > villageEvent.villageData.collectTotal){
					LogicUtils.removeItemInArray(attackAllianceDoc.villageEvents, villageEvent)
					attackAllianceData.__villageEvents = []
					attackAllianceData.__villageEvents.push({
						type:Consts.DataChangedType.Remove,
						data:villageEvent
					})

					var originalRewards = villageEvent.playerData.rewards
					var resourceType = village.type.slice(0, -7)
					var newRewards = [{
						type:"resources",
						name:resourceType,
						count:villageEvent.villageData.collectTotal
					}]
					LogicUtils.mergeRewards(originalRewards, newRewards)

					marchReturnEvent = MarchUtils.createAttackVillageMarchReturnEvent(attackAllianceDoc, defencePlayerDoc, villageEvent.playerData.dragon, villageEvent.playerData.soldiers, villageEvent.playerData.woundedSoldiers, targetAllianceDoc, village, originalRewards)
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
					attackAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
					attackAllianceData.__attackMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:marchReturnEvent
					}]

					var collectReport = ReportUtils.createCollectVillageReport(targetAllianceDoc, village, newRewards)
					LogicUtils.addPlayerReport(defencePlayerDoc, defencePlayerData, collectReport)
					updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
					pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])
					updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, attackPlayerDoc._id])

					village.resource -= villageEvent.villageData.collectTotal
					targetAllianceData.__villages = [{
						type:Consts.DataChangedType.Edit,
						data:village
					}]
					eventData = MarchUtils.createAllianceVillageEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, event.attackPlayerData.soldiers, [], targetAllianceDoc, village, [])
					newVillageEvent = eventData.event
					if(newVillageEvent.villageData.resource <= newVillageEvent.villageData.collectTotal){
						eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "villageEvents", newVillageEvent.id, newVillageEvent.finishTime])
					}
					attackAllianceDoc.villageEvents.push(newVillageEvent)
					attackAllianceData.__villageEvents.push({
						type:Consts.DataChangedType.Add,
						data:newVillageEvent
					})

					if(_.isObject(defenceAllianceDoc)){
						if(_.isEqual(defenceAllianceDoc, targetAllianceDoc)){
							updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
							pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
							LogicUtils.putAllianceDataToEnemyAllianceData(defenceAllianceData, attackAllianceData)
						}else{
							updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
						}
					}else{
						pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
						LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
					}
				}
				return Promise.resolve()
			}
			if(!_.isEqual(attackPlayerDoc.alliance.id, defencePlayerDoc.alliance.id)){
				defenceDragon = defencePlayerDoc.dragons[villageEvent.playerData.dragon.type]
				defenceDragonForFight = DataUtils.createPlayerDragonForFight(defencePlayerDoc, defenceDragon)
				defenceSoldiersForFight = DataUtils.createPlayerSoldiersForFight(defencePlayerDoc, villageEvent.playerData.soldiers)
				var defenceTreatSoldierPercent = DataUtils.getPlayerDamagedSoldierToWoundedSoldierPercent(defencePlayerDoc)
				var defenceDragonFightFixEffect = DataUtils.getDragonFightFixedEffect(attackSoldiersForFight, defenceSoldiersForFight)
				var defenceDragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, defenceDragonForFight, defenceDragonFightFixEffect)
				var defenceSoldierFightData = FightUtils.soldierToSoldierFight(attackSoldiersForFight, attackTreatSoldierPercent, defenceSoldiersForFight, defenceTreatSoldierPercent)

				report = ReportUtils.createAttackVillageFightWithDefenceTroopReport(attackAllianceDoc, attackPlayerDoc, targetAllianceDoc, village, defenceAllianceDoc, defencePlayerDoc, defenceDragonFightData, defenceSoldierFightData)
				countData = report.countData
				LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report.report)
				LogicUtils.addPlayerReport(defencePlayerDoc, defencePlayerData, report.report)

				attackDragonExpAdd = countData.attackDragonExpAdd
				attackPlayerKill = countData.attackPlayerKill
				attackSoldiers = createSoldiers(defenceSoldierFightData.attackSoldiersAfterFight)
				attackWoundedSoldiers = createWoundedSoldiers(defenceSoldierFightData.attackSoldiersAfterFight)
				attackRewards = report.report.attackVillage.attackPlayerData.rewards
				defenceDragonExpAdd = countData.attackDragonExpAdd
				defencePlayerKill = countData.attackPlayerKill
				defenceSoldiers = createSoldiers(defenceSoldierFightData.defenceSoldiersAfterFight)
				defenceWoundedSoldiers = createWoundedSoldiers(defenceSoldierFightData.defenceSoldiersAfterFight)
				defenceRewards = report.report.attackVillage.defencePlayerData.rewards

				villageEvent.playerData.soldiers = defenceSoldiers
				LogicUtils.mergeRewards(villageEvent.playerData.rewards, defenceRewards)
				LogicUtils.mergeSoldiers(villageEvent.playerData.woundedSoldiers, defenceWoundedSoldiers)

				attackPlayerDoc.basicInfo.kill += attackPlayerKill
				DataUtils.updatePlayerDragonProperty(attackPlayerDoc, attackDragon, defenceDragonFightData.attackDragonHpDecreased, attackDragonExpAdd)
				attackPlayerData.basicInfo = attackPlayerDoc.basicInfo
				attackPlayerData.dragons = {}
				attackPlayerData.dragons[attackDragon.type] = attackPlayerDoc.dragons[attackDragon.type]
				defencePlayerDoc.basicInfo.kill += defencePlayerKill
				DataUtils.updatePlayerDragonProperty(defencePlayerDoc, defenceDragon, defenceDragonFightData.defenceDragonHpDecreased, defenceDragonExpAdd)
				defencePlayerData.basicInfo = defencePlayerDoc.basicInfo
				defencePlayerData.dragons = {}
				defencePlayerData.dragons[defenceDragon.type] = defencePlayerDoc.dragons[defenceDragon.type]
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])

				var resourceCollected = Math.floor(villageEvent.villageData.collectTotal * ((Date.now() - villageEvent.startTime) / (villageEvent.finishTime - villageEvent.startTime)))
				resourceCollected = resourceCollected > villageEvent.villageData.collectTotal ? villageEvent.villageData.collectTotal : resourceCollected
				if(_.isEqual(Consts.FightResult.AttackWin, defenceSoldierFightData.fightResult)){
					if(villageEvent.villageData.resource <= villageEvent.villageData.collectTotal){
						eventFuncs.push([self.timeEventService, self.timeEventService.removeAllianceTimeEventAsync, defenceAllianceDoc, villageEvent.id])
					}
					LogicUtils.removeItemInArray(defenceAllianceDoc.villageEvents, villageEvent)
					defenceAllianceData.__villageEvents = [{
						type:Consts.DataChangedType.Remove,
						data:villageEvent
					}]
					marchReturnEvent = MarchUtils.createAttackVillageMarchReturnEvent(defenceAllianceDoc, defencePlayerDoc, villageEvent.playerData.dragon, villageEvent.playerData.soldiers, villageEvent.playerData.woundedSoldiers, targetAllianceDoc, village, villageEvent.playerData.rewards)
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, defenceAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
					defenceAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
					defenceAllianceData.__attackMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:marchReturnEvent
					}]
					updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
					LogicUtils.putAllianceDataToEnemyAllianceData(defenceAllianceData, attackAllianceData)

					eventData = MarchUtils.createAllianceVillageEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, attackSoldiers, attackWoundedSoldiers, targetAllianceDoc, village, attackRewards)
					newVillageEvent = eventData.event
					if(eventData.collectTotal <= resourceCollected){
						newVillageEvent.startTime -= eventData.collectTime
						newVillageEvent.finishTime -= eventData.collectTime
					}else{
						var timeUsed = Math.floor(eventData.collectTime * (resourceCollected / eventData.collectTotal))
						newVillageEvent.startTime -= timeUsed
						newVillageEvent.finishTime -= timeUsed
					}
					if(newVillageEvent.villageData.resource <= newVillageEvent.villageData.collectTotal){
						eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "villageEvents", newVillageEvent.id, newVillageEvent.finishTime])
					}

					attackAllianceDoc.villageEvents.push(newVillageEvent)
					attackAllianceData.__villageEvents = [{
						type:Consts.DataChangedType.Add,
						data:newVillageEvent
					}]
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
					LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceData, defenceAllianceData)
				}else{
					marchReturnEvent = MarchUtils.createAttackVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, attackSoldiers, attackWoundedSoldiers, targetAllianceDoc, village, attackRewards)
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
					attackAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
					attackAllianceData.__attackMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:marchReturnEvent
					}]
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
					LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceData, defenceAllianceData)

					if(villageEvent.villageData.resource <= villageEvent.villageData.collectTotal){
						eventFuncs.push([self.timeEventService, self.timeEventService.removeAllianceTimeEventAsync, defenceAllianceDoc, villageEvent.id])
					}
					var newSoldierLoadTotal = DataUtils.getPlayerSoldiersTotalLoad(defencePlayerDoc, villageEvent.playerData.soldiers)
					var newCollectInfo = DataUtils.getPlayerCollectResourceInfo(defencePlayerDoc, newSoldierLoadTotal, village)
					villageEvent.villageData.collectTotal = newCollectInfo.collectTotal
					villageEvent.finishTime = villageEvent.startTime + newCollectInfo.collectTime
					defenceAllianceData.__villageEvents = [{
						type:Consts.DataChangedType.Edit,
						data:villageEvent
					}]
					if(villageEvent.villageData.resource <= villageEvent.villageData.collectTotal){
						eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, defenceAllianceDoc, "villageEvents", villageEvent.id, villageEvent.finishTime])
					}
					updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
					LogicUtils.putAllianceDataToEnemyAllianceData(defenceAllianceData, attackAllianceData)
				}
				return Promise.resolve()
			}
		}).then(function(){
			callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
		}).catch(function(e){
			funcs = []
			if(_.isObject(attackPlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
			}
			if(_.isObject(defencePlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(defencePlayerDoc._id))
			}
			if(_.isObject(attackAllianceDoc)){
				funcs.push(self.allianceDao.removeLockByIdAsync(attackAllianceDoc._id))
			}
			if(_.isObject(defenceAllianceDoc) && attackAllianceDoc != defenceAllianceDoc){
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
}

/**
 * 进攻返回玩家城市事件回调
 * @param allianceDoc
 * @param event
 * @param callback
 */
pro.onAttackMarchReturnEvents = function(allianceDoc, event, callback){
	var self = this
	var allianceData = {}
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []
	LogicUtils.removeItemInArray(allianceDoc.attackMarchReturnEvents, event)
	allianceData.__attackMarchReturnEvents = [{
		type:Consts.DataChangedType.Remove,
		data:event
	}]
	//console.log(NodeUtils.inspect(event, false, null))
	var playerDoc = null
	this.playerDao.findByIdAsync(event.attackPlayerData.id, true).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
		playerDoc = doc
		var playerData = {}
		playerDoc.dragons[event.attackPlayerData.dragon.type].status = Consts.DragonStatus.Free
		playerData.dragons = {}
		playerData.dragons[event.attackPlayerData.dragon.type] = playerDoc.dragons[event.attackPlayerData.dragon.type]
		playerData.soldiers = {}
		_.each(event.attackPlayerData.soldiers, function(soldier){
			playerDoc.soldiers[soldier.name] += soldier.count
			playerData.soldiers[soldier.name] = playerDoc.soldiers[soldier.name]
		})
		playerData.woundedSoldiers = {}
		_.each(event.attackPlayerData.woundedSoldiers, function(soldier){
			playerDoc.woundedSoldiers[soldier.name] += soldier.count
			playerData.woundedSoldiers[soldier.name] = playerDoc.woundedSoldiers[soldier.name]
		})
		LogicUtils.refreshPlayerResources(playerDoc)
		_.each(event.attackPlayerData.rewards, function(reward){
			playerDoc[reward.type][reward.name] += reward.count
			if(!_.isObject(playerData[reward.type])) playerData[reward.type] = playerDoc[reward.type]
		})
		LogicUtils.refreshPlayerResources(playerDoc)
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources

		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
		LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(allianceDoc, allianceData, pushFuncs, self.pushService)
		return Promise.resolve()
	}).then(function(){
		callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
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
 * 突袭行军事件回调
 * @param allianceDoc
 * @param event
 * @param callback
 */
pro.onStrikeMarchEvents = function(allianceDoc, event, callback){
	var self = this
	var attackAllianceDoc = allianceDoc
	var attackAllianceData = {}
	var attackPlayerDoc = null
	var attackPlayerData = {}
	var defencePlayerDoc = null
	var defencePlayerData = {}
	var defenceAllianceDoc = null
	var defenceAllianceData = {}
	var helpDefencePlayerDoc = null
	var helpDefencePlayerData = {}
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []
	var funcs = null
	LogicUtils.removeItemInArray(attackAllianceDoc.strikeMarchEvents, event)
	attackAllianceData.__strikeMarchEvents = [{
		type:Consts.DataChangedType.Remove,
		data:event
	}]
	if(_.isEqual(event.marchType, Consts.AllianceMarchType.City)){
		funcs = []
		funcs.push(self.playerDao.findByIdAsync(event.attackPlayerData.id, true))
		funcs.push(self.allianceDao.findByIdAsync(event.defencePlayerData.alliance.id, true))
		funcs.push(self.playerDao.findByIdAsync(event.defencePlayerData.id, true))
		Promise.all(funcs).spread(function(doc_1, doc_2, doc_3){
			if(!_.isObject(doc_1)) return Promise.reject(new Error("玩家不存在"))
			attackPlayerDoc = doc_1
			if(!_.isObject(doc_2)) return Promise.reject(new Error("联盟不存在"))
			defenceAllianceDoc = doc_2
			if(!_.isObject(doc_3)) return Promise.reject(new Error("玩家不存在"))
			defencePlayerDoc = doc_3
			if(defencePlayerDoc.helpedByTroops.length > 0){
				return self.playerDao.findByIdAsync(defencePlayerDoc.helpedByTroops[0].id)
			}
			return Promise.resolve()
		}).then(function(doc){
			if(defencePlayerDoc.helpedByTroops.length > 0){
				if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
				helpDefencePlayerDoc = doc
			}

			var attackDragon = attackPlayerDoc.dragons[event.attackPlayerData.dragon.type]
			var attackDragonForFight = DataUtils.createPlayerDragonForFight(attackPlayerDoc, attackDragon)
			var dragonFightData = null
			var report = null
			var strikeMarchReturnEvent = null
			var rewardsForAttackPlayer = null
			var rewardsForDefencePlayer = null
			if(_.isObject(helpDefencePlayerDoc)){
				var helpDefenceDragon = helpDefencePlayerDoc.dragons[defencePlayerDoc.helpedByTroops[0].dragon.type]
				var helpDefenceDragonForFight = DataUtils.createPlayerDragonForFight(helpDefencePlayerDoc, helpDefenceDragon)
				dragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, helpDefenceDragonForFight, 0)
				report = ReportUtils.createStrikeCityFightWithHelpDefenceDragonReport(attackAllianceDoc, attackPlayerDoc, attackDragonForFight, defenceAllianceDoc, defencePlayerDoc, helpDefencePlayerDoc, helpDefenceDragonForFight, dragonFightData)
				LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report.reportForAttackPlayer)
				LogicUtils.addPlayerReport(helpDefencePlayerDoc, helpDefencePlayerData, report.reportForDefencePlayer)
				var helpDefenceTitle = Localizations.Alliance.HelpDefenceStrikeTitle
				var helpDefenceContent = Localizations.Alliance.HelpDefenceStrikeContent
				var helpDefenceParams = [helpDefencePlayerDoc.basicInfo.name, defenceAllianceDoc.basicInfo.tag]
				LogicUtils.sendSystemMail(defencePlayerDoc, defencePlayerData, helpDefenceTitle, helpDefenceParams, helpDefenceContent, helpDefenceParams)

				attackDragon.hp -= dragonFightData.attackDragonHpDecreased
				attackPlayerData.dragons = {}
				attackPlayerData.dragons[attackDragon.type] = attackDragon
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])

				helpDefenceDragon.hp -= dragonFightData.defenceDragonHpDecreased
				helpDefencePlayerData.dragons = {}
				helpDefencePlayerData.dragons[helpDefenceDragon.type] = helpDefenceDragon
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, helpDefencePlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, helpDefencePlayerDoc, helpDefencePlayerData])

				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])

				if(_.isEqual(attackAllianceDoc._id, attackAllianceDoc.allianceFight.attackAllianceId)){
					attackAllianceDoc.allianceFight.attackAllianceCountData.strikeCount += 1
					defenceAllianceDoc.allianceFight.attackAllianceCountData.strikeCount += 1
					if(_.isEqual(dragonFightData.fightResult, Consts.FightResult.AttackWin)){
						attackAllianceDoc.allianceFight.attackAllianceCountData.strikeSuccessCount += 1
						defenceAllianceDoc.allianceFight.attackAllianceCountData.strikeSuccessCount += 1
					}
					attackAllianceData.allianceFight = {}
					attackAllianceData.allianceFight.attackAllianceCountData = attackAllianceDoc.allianceFight.attackAllianceCountData
					defenceAllianceData.allianceFight = {}
					defenceAllianceData.allianceFight.attackAllianceCountData = defenceAllianceDoc.allianceFight.attackAllianceCountData
				}else{
					attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeCount += 1
					defenceAllianceDoc.allianceFight.defenceAllianceCountData.strikeCount += 1
					if(_.isEqual(dragonFightData.fightResult, Consts.FightResult.AttackWin)){
						attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeSuccessCount += 1
						defenceAllianceDoc.allianceFight.defenceAllianceCountData.strikeSuccessCount += 1
					}
					attackAllianceData.allianceFight = {}
					attackAllianceData.allianceFight.defenceAllianceCountData = attackAllianceDoc.allianceFight.defenceAllianceCountData
					defenceAllianceData.allianceFight = {}
					defenceAllianceData.allianceFight.defenceAllianceCountData = defenceAllianceDoc.allianceFight.defenceAllianceCountData
				}

				rewardsForAttackPlayer = report.reportForAttackPlayer.strikeCity.attackPlayerData.rewards
				strikeMarchReturnEvent = MarchUtils.createStrikePlayerCityMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, defenceAllianceDoc, defencePlayerDoc, rewardsForAttackPlayer)
				attackAllianceDoc.strikeMarchReturnEvents.push(strikeMarchReturnEvent)
				attackAllianceData.__strikeMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:strikeMarchReturnEvent
				}]
				eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "strikeMarchReturnEvents", strikeMarchReturnEvent.id, strikeMarchReturnEvent.arriveTime])
				LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceData, defenceAllianceData)

				var rewardsForHelpDefencePlayer = report.reportForDefencePlayer.cityBeStriked.helpDefencePlayerData.rewards
				var helpedByTroop = defencePlayerDoc.helpedByTroops[0]
				LogicUtils.mergeRewards(helpedByTroop.rewards, rewardsForHelpDefencePlayer)
				if(helpDefenceDragon.hp <= 0){
					LogicUtils.removeItemInArray(defencePlayerDoc.helpedByTroops, helpedByTroop)
					defencePlayerData.__helpedByTroops = [{
						type:Consts.DataChangedType.Remove,
						data:helpedByTroop
					}]
					var helpToTroop = _.find(helpDefencePlayerDoc.helpToTroops, function(troop){
						return _.isEqual(troop.beHelpedPlayerData.id, defencePlayerDoc._id)
					})
					LogicUtils.removeItemInArray(helpDefencePlayerDoc.helpToTroops, helpToTroop)
					helpDefencePlayerData.__helpToTroops = [{
						type:Consts.DataChangedType.Remove,
						data:helpToTroop
					}]
					var defencePlayerInAlliance = LogicUtils.getAllianceMemberById(defenceAllianceDoc, defencePlayerDoc._id)
					defencePlayerInAlliance.helpedByTroopsCount -= 1
					defenceAllianceData.__members = [{
						type:Consts.DataChangedType.Edit,
						data:defencePlayerInAlliance
					}]
					var helpDefenceMarchReturnEvent = MarchUtils.createHelpDefenceMarchReturnEvent(defenceAllianceDoc, helpDefencePlayerDoc, defencePlayerDoc, helpedByTroop.dragon, helpedByTroop.soldiers, helpedByTroop.woundedSoldiers, helpedByTroop.rewards)
					defenceAllianceDoc.attackMarchReturnEvents.push(helpDefenceMarchReturnEvent)
					defenceAllianceData.__attackMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:helpDefenceMarchReturnEvent
					}]
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, defenceAllianceDoc, "attackMarchReturnEvents", helpDefenceMarchReturnEvent.id, helpDefenceMarchReturnEvent.arriveTime])
					LogicUtils.putAllianceDataToEnemyAllianceData(defenceAllianceData, attackAllianceData)
				}else{
					defencePlayerData.__helpedByTroops = [{
						type:Consts.DataChangedType.Edit,
						data:helpedByTroop
					}]
				}

				updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
				return Promise.resolve()
			}
			if(!_.isObject(helpDefencePlayerDoc)){
				var defenceDragon = LogicUtils.getPlayerDefenceDragon(defencePlayerDoc)
				if(!_.isObject(defenceDragon)){
					report = ReportUtils.createStrikeCityNoDefenceDragonReport(attackAllianceDoc, attackPlayerDoc, attackDragonForFight, defenceAllianceDoc, defencePlayerDoc)
					LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report.reportForAttackPlayer)
					LogicUtils.addPlayerReport(defencePlayerDoc, defencePlayerData, report.reportForDefencePlayer)

					updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
					pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])
					updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
					pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])

					if(_.isEqual(attackAllianceDoc._id, attackAllianceDoc.allianceFight.attackAllianceId)){
						attackAllianceDoc.allianceFight.attackAllianceCountData.strikeCount += 1
						defenceAllianceDoc.allianceFight.attackAllianceCountData.strikeCount += 1
						attackAllianceDoc.allianceFight.attackAllianceCountData.strikeSuccessCount += 1
						defenceAllianceDoc.allianceFight.attackAllianceCountData.strikeSuccessCount += 1
						attackAllianceData.allianceFight = {}
						attackAllianceData.allianceFight.attackAllianceCountData = attackAllianceDoc.allianceFight.attackAllianceCountData
						defenceAllianceData.allianceFight = {}
						defenceAllianceData.allianceFight.attackAllianceCountData = defenceAllianceDoc.allianceFight.attackAllianceCountData
					}else{
						attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeCount += 1
						defenceAllianceDoc.allianceFight.defenceAllianceCountData.strikeCount += 1
						attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeSuccessCount += 1
						defenceAllianceDoc.allianceFight.defenceAllianceCountData.strikeSuccessCount += 1
						attackAllianceData.allianceFight = {}
						attackAllianceData.allianceFight.defenceAllianceCountData = attackAllianceDoc.allianceFight.defenceAllianceCountData
						defenceAllianceData.allianceFight = {}
						defenceAllianceData.allianceFight.defenceAllianceCountData = defenceAllianceDoc.allianceFight.defenceAllianceCountData
					}

					rewardsForAttackPlayer = report.reportForAttackPlayer.strikeCity.attackPlayerData.rewards
					strikeMarchReturnEvent = MarchUtils.createStrikePlayerCityMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, defenceAllianceDoc, defencePlayerDoc, rewardsForAttackPlayer)
					attackAllianceDoc.strikeMarchReturnEvents.push(strikeMarchReturnEvent)
					attackAllianceData.__strikeMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:strikeMarchReturnEvent
					}]
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "strikeMarchReturnEvents", strikeMarchReturnEvent.id, strikeMarchReturnEvent.arriveTime])
					LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceData, defenceAllianceData)

					LogicUtils.refreshPlayerResources(defencePlayerDoc)
					rewardsForDefencePlayer = report.reportForDefencePlayer.cityBeStriked.defencePlayerData.rewards
					_.each(rewardsForDefencePlayer, function(reward){
						defencePlayerDoc[reward.type][reward.name] += reward.count
						if(!_.isObject(defencePlayerDoc[reward.type])) defencePlayerData[reward.type] = defencePlayerDoc[reward.type]
					})
					defencePlayerData.basicInfo = defencePlayerDoc.basicInfo
					defencePlayerData.resources = defencePlayerDoc.resources

					updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
				}else{
					var defenceDragonForFight = DataUtils.createPlayerDragonForFight(defencePlayerDoc, defenceDragon)
					dragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, defenceDragonForFight, 0)
					report = ReportUtils.createStrikeCityFightWithDefenceDragonReport(attackAllianceDoc, attackPlayerDoc, attackDragonForFight, defenceAllianceDoc, defencePlayerDoc, defenceDragonForFight, dragonFightData)
					LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report.reportForAttackPlayer)
					LogicUtils.addPlayerReport(defencePlayerDoc, defencePlayerData, report.reportForDefencePlayer)

					attackDragon.hp -= dragonFightData.attackDragonHpDecreased
					attackPlayerData.dragons = {}
					attackPlayerData.dragons[attackDragon.type] = attackDragon
					updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
					pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])

					defenceDragon.hp -= dragonFightData.defenceDragonHpDecreased
					defencePlayerData.dragons = {}
					defencePlayerData.dragons[defenceDragon.type] = defenceDragon
					if(defenceDragon.hp <= 0){
						defenceDragon.status = Consts.DragonStatus.Free
					}
					updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
					pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])

					if(_.isEqual(attackAllianceDoc._id, attackAllianceDoc.allianceFight.attackAllianceId)){
						attackAllianceDoc.allianceFight.attackAllianceCountData.strikeCount += 1
						defenceAllianceDoc.allianceFight.attackAllianceCountData.strikeCount += 1
						if(_.isEqual(dragonFightData.fightResult, Consts.FightResult.AttackWin)){
							attackAllianceDoc.allianceFight.attackAllianceCountData.strikeSuccessCount += 1
							defenceAllianceDoc.allianceFight.attackAllianceCountData.strikeSuccessCount += 1
						}
						attackAllianceData.allianceFight = {}
						attackAllianceData.allianceFight.attackAllianceCountData = attackAllianceDoc.allianceFight.attackAllianceCountData
						defenceAllianceData.allianceFight = {}
						defenceAllianceData.allianceFight.attackAllianceCountData = defenceAllianceDoc.allianceFight.attackAllianceCountData
					}else{
						attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeCount += 1
						defenceAllianceDoc.allianceFight.defenceAllianceCountData.strikeCount += 1
						if(_.isEqual(dragonFightData.fightResult, Consts.FightResult.AttackWin)){
							attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeSuccessCount += 1
							defenceAllianceDoc.allianceFight.defenceAllianceCountData.strikeSuccessCount += 1
						}
						attackAllianceData.allianceFight = {}
						attackAllianceData.allianceFight.defenceAllianceCountData = attackAllianceDoc.allianceFight.defenceAllianceCountData
						defenceAllianceData.allianceFight = {}
						defenceAllianceData.allianceFight.defenceAllianceCountData = defenceAllianceDoc.allianceFight.defenceAllianceCountData
					}

					rewardsForAttackPlayer = report.reportForAttackPlayer.strikeCity.attackPlayerData.rewards
					strikeMarchReturnEvent = MarchUtils.createStrikePlayerCityMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, defenceAllianceDoc, defencePlayerDoc, rewardsForAttackPlayer)
					attackAllianceDoc.strikeMarchReturnEvents.push(strikeMarchReturnEvent)
					attackAllianceData.__strikeMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:strikeMarchReturnEvent
					}]
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "strikeMarchReturnEvents", strikeMarchReturnEvent.id, strikeMarchReturnEvent.arriveTime])
					LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceData, defenceAllianceData)

					LogicUtils.refreshPlayerResources(defencePlayerDoc)
					rewardsForDefencePlayer = report.reportForDefencePlayer.cityBeStriked.defencePlayerData.rewards
					_.each(rewardsForDefencePlayer, function(reward){
						defencePlayerDoc[reward.type][reward.name] += reward.count
						if(!_.isObject(defencePlayerDoc[reward.type])) defencePlayerData[reward.type] = defencePlayerDoc[reward.type]
					})
					defencePlayerData.basicInfo = defencePlayerDoc.basicInfo
					defencePlayerData.resources = defencePlayerDoc.resources

					updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
				}
				return Promise.resolve()
			}
		}).then(function(){
			callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
		}).catch(function(e){
			var funcs = []
			if(_.isObject(attackPlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
			}
			if(_.isObject(defencePlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(defencePlayerDoc._id))
			}
			if(_.isObject(helpDefencePlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(helpDefencePlayerDoc._id))
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
		return
	}
	if(_.isEqual(event.marchType, Consts.AllianceMarchType.Village)){
		var attackDragon = null
		var attackDragonForFight = null
		var villageEvent = null
		var village = null
		var targetAllianceDoc = null
		var targetAllianceData = null
		var report = null
		var marchReturnEvent = null

		funcs = []
		funcs.push(self.playerDao.findByIdAsync(event.attackPlayerData.id, true))
		if(_.isObject(attackAllianceDoc.allianceFight)){
			var defenceAllianceId = _.isEqual(attackAllianceDoc._id, attackAllianceDoc.allianceFight.attackAllianceId) ? attackAllianceDoc.allianceFight.defenceAllianceId : attackAllianceDoc.allianceFight.attackAllianceId
			funcs.push(self.allianceDao.findByIdAsync(defenceAllianceId, true))
		}
		Promise.all(funcs).spread(function(doc_1, doc_2){
			if(!_.isObject(doc_1)) return Promise.reject(new Error("玩家不存在"))
			attackPlayerDoc = doc_1
			if(_.isObject(attackAllianceDoc.allianceFight)){
				if(!_.isObject(doc_2)) return Promise.reject(new Error("联盟不存在"))
				defenceAllianceDoc = doc_2
				defenceAllianceData = {}
				targetAllianceDoc = _.isEqual(event.defenceVillageData.alliance.id, attackAllianceDoc._id) ? attackAllianceDoc : defenceAllianceDoc
				targetAllianceData = _.isEqual(event.defenceVillageData.alliance.id, attackAllianceDoc._id) ? attackAllianceData : defenceAllianceData
			}else{
				targetAllianceDoc = attackAllianceDoc
				targetAllianceData = attackAllianceData
			}

			villageEvent = _.find(attackAllianceDoc.villageEvents, function(villageEvent){
				return _.isEqual(villageEvent.villageData.id, event.defenceVillageData.id)
			})
			if(!_.isObject(villageEvent) && _.isObject(defenceAllianceDoc)){
				villageEvent = _.find(defenceAllianceDoc.villageEvents, function(villageEvent){
					return _.isEqual(villageEvent.villageData.id, event.defenceVillageData.id)
				})
			}
			if(_.isObject(villageEvent)){
				return self.playerDao.findByIdAsync(villageEvent.playerData.id, true)
			}
			return Promise.resolve()
		}).then(function(doc){
			if(_.isObject(villageEvent)){
				if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
				defencePlayerDoc = doc
			}
			attackDragon = attackPlayerDoc.dragons[event.attackPlayerData.dragon.type]
			attackDragonForFight = DataUtils.createPlayerDragonForFight(attackPlayerDoc, attackDragon)
			village = LogicUtils.getAllianceVillageById(targetAllianceDoc, event.defenceVillageData.id)
			if(!_.isObject(village)){
				var deletedVillage = {
					id:event.defenceVillageData.id,
					type:event.defenceVillageData.type,
					level:event.defenceVillageData.level,
					location:event.defenceVillageData.location
				}
				marchReturnEvent = MarchUtils.createStrikeVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, targetAllianceDoc, deletedVillage, [])
				attackAllianceDoc.strikeMarchReturnEvents.push(marchReturnEvent)
				attackAllianceData.__strikeMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:marchReturnEvent
				}]
				updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, attackPlayerDoc._id])
				if(_.isObject(defenceAllianceDoc)){
					updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
				}
				eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "strikeMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				return Promise.resolve()
			}
			if(!_.isObject(villageEvent)){
				var villageDragon = {
					type:village.dragon.type,
					level:village.dragon.level,
					strength:DataUtils.getPlayerDragonStrength(null, village.dragon),
					vitality:DataUtils.getPlayerDragonVitality(null, village.dragon)
				}
				villageDragon.hp = DataUtils.getPlayerDragonHpMax(null, villageDragon)
				var villageDragonForFight = DataUtils.createPlayerDragonForFight(null, villageDragon)
				var villageDragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, villageDragonForFight, 0)

				report = ReportUtils.createStrikeVillageFightWithVillageDragonReport(attackAllianceDoc, attackPlayerDoc, attackDragonForFight, targetAllianceDoc, village, villageDragonForFight, villageDragonFightData)
				LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report)
				attackPlayerDoc.dragons[attackDragon.type].hp -= villageDragonFightData.attackDragonHpDecreased
				attackPlayerData.dragons = {}
				attackPlayerData.dragons[attackDragon.type] = attackPlayerDoc.dragons[attackDragon.type]
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])

				marchReturnEvent = MarchUtils.createStrikeVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, targetAllianceDoc, village, [])
				attackAllianceDoc.strikeMarchReturnEvents.push(marchReturnEvent)
				attackAllianceData.__strikeMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:marchReturnEvent
				}]

				if(_.isObject(defenceAllianceDoc)){
					updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
				}
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				return Promise.resolve()
			}
			if(_.isEqual(attackPlayerDoc.alliance.id, defencePlayerDoc.alliance.id)){
				marchReturnEvent = MarchUtils.createStrikeVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, targetAllianceDoc, village, [])
				attackAllianceDoc.strikeMarchReturnEvents.push(marchReturnEvent)
				attackAllianceData.__strikeMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:marchReturnEvent
				}]
				updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, attackPlayerDoc._id])
				if(_.isObject(defenceAllianceDoc)){
					updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
				}
				eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "strikeMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				return Promise.resolve()
			}
			if(!_.isEqual(attackPlayerDoc.alliance.id, defencePlayerDoc.alliance.id)){
				var defenceDragon = defencePlayerDoc.dragons[villageEvent.playerData.dragon.type]
				var defenceDragonForFight = DataUtils.createPlayerDragonForFight(defencePlayerDoc, defenceDragon)
				var defenceDragonFightData = FightUtils.dragonToDragonFight(attackDragonForFight, defenceDragonForFight, 0)

				report = ReportUtils.createStrikeVillageFightWithDefencePlayerDragonReport(attackAllianceDoc, attackPlayerDoc, attackDragonForFight, targetAllianceDoc, village, defenceAllianceDoc, villageEvent, defencePlayerDoc, defenceDragonForFight, defenceDragonFightData)
				LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, report.reportForAttackPlayer)
				LogicUtils.addPlayerReport(defencePlayerDoc, defencePlayerData, report.reportForDefencePlayer)

				attackPlayerDoc.dragons[attackDragon.type].hp -= defenceDragonFightData.attackDragonHpDecreased
				attackPlayerData.dragons = {}
				attackPlayerData.dragons[attackDragon.type] = attackPlayerDoc.dragons[attackDragon.type]
				defencePlayerDoc.dragons[defenceDragon.type].hp -= defenceDragonFightData.defenceDragonHpDecreased
				defencePlayerData.dragons = {}
				defencePlayerData.dragons[defenceDragon.type] = defencePlayerDoc.dragons[defenceDragon.type]
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, defencePlayerDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, defencePlayerDoc, defencePlayerData])

				marchReturnEvent = MarchUtils.createStrikeVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, attackDragon, targetAllianceDoc, village, [])
				eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "strikeMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
				attackAllianceDoc.strikeMarchReturnEvents.push(marchReturnEvent)
				attackAllianceData.__attackMarchReturnEvents = [{
					type:Consts.DataChangedType.Add,
					data:marchReturnEvent
				}]
				if(defencePlayerDoc.dragons[defenceDragon.type].hp <= 0){
					if(villageEvent.villageData.resource <= villageEvent.villageData.collectTotal){
						eventFuncs.push([self.timeEventService, self.timeEventService.removeAllianceTimeEventAsync, defenceAllianceDoc, villageEvent.id])
					}
					LogicUtils.removeItemInArray(defenceAllianceDoc.villageEvents, villageEvent)
					defenceAllianceData.__villageEvents = [{
						type:Consts.DataChangedType.Remove,
						data:villageEvent
					}]

					var resourceCollected = Math.floor(villageEvent.villageData.collectTotal * ((Date.now() - villageEvent.startTime) / (villageEvent.finishTime - villageEvent.startTime)))
					resourceCollected = resourceCollected > villageEvent.villageData.collectTotal ? villageEvent.villageData.collectTotal : resourceCollected
					var originalRewards = villageEvent.playerData.rewards
					var resourceType = village.type.slice(0, -7)
					var newRewards = [{
						type:"resources",
						name:resourceType,
						count:resourceCollected
					}]
					LogicUtils.mergeRewards(originalRewards, newRewards)

					marchReturnEvent = MarchUtils.createAttackVillageMarchReturnEvent(defenceAllianceDoc, defencePlayerDoc, villageEvent.playerData.dragon, villageEvent.playerData.soldiers, villageEvent.playerData.woundedSoldiers, targetAllianceDoc, village, originalRewards)
					eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, defenceAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
					defenceAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
					defenceAllianceData.__attackMarchReturnEvents = [{
						type:Consts.DataChangedType.Add,
						data:marchReturnEvent
					}]

					var collectReport = ReportUtils.createCollectVillageReport(targetAllianceDoc, village, newRewards)
					LogicUtils.addPlayerReport(defencePlayerDoc, defencePlayerData, collectReport)

					village.resource -= resourceCollected
					targetAllianceData.__villages = [{
						type:Consts.DataChangedType.Edit,
						data:village
					}]
				}
				if(targetAllianceDoc == defenceAllianceDoc || defencePlayerDoc.dragons[defenceDragon.type].hp <= 0){
					updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
					pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
					LogicUtils.putAllianceDataToEnemyAllianceData(defenceAllianceData, attackAllianceData)
					LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceData, defenceAllianceData)
				}else{
					updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, defenceAllianceDoc._id])
					LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
				}
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
				return Promise.resolve()
			}
		}).then(function(){
			callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
		}).catch(function(e){
			funcs = []
			if(_.isObject(attackPlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
			}
			if(_.isObject(defencePlayerDoc)){
				funcs.push(self.playerDao.removeLockByIdAsync(defencePlayerDoc._id))
			}
			if(_.isObject(attackAllianceDoc)){
				funcs.push(self.allianceDao.removeLockByIdAsync(attackAllianceDoc._id))
			}
			if(_.isObject(defenceAllianceDoc) && attackAllianceDoc != defenceAllianceDoc){
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
}

/**
 * 突袭返回玩家城市事件回调
 * @param allianceDoc
 * @param event
 * @param callback
 */
pro.onStrikeMarchReturnEvents = function(allianceDoc, event, callback){
	var self = this
	var allianceData = {}
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []
	LogicUtils.removeItemInArray(allianceDoc.strikeMarchReturnEvents, event)
	allianceData.__strikeMarchReturnEvents = [{
		type:Consts.DataChangedType.Remove,
		data:event
	}]

	var playerDoc = null
	this.playerDao.findByIdAsync(event.attackPlayerData.id, true).then(function(doc){
		if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
		playerDoc = doc
		var playerData = {}
		playerDoc.dragons[event.attackPlayerData.dragon.type].status = Consts.DragonStatus.Free
		playerData.dragons = {}
		playerData.dragons[event.attackPlayerData.dragon.type] = playerDoc.dragons[event.attackPlayerData.dragon.type]
		LogicUtils.refreshPlayerResources(playerDoc)
		_.each(event.attackPlayerData.rewards, function(reward){
			playerDoc[reward.type][reward.name] += reward.count
			if(!_.isObject(playerData[reward.type])) playerData[reward.type] = playerDoc[reward.type]
		})
		LogicUtils.refreshPlayerResources(playerDoc)
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
		LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(allianceDoc, allianceData, pushFuncs, self.pushService)
		return Promise.resolve()
	}).then(function(){
		callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
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
 * 联盟圣地事件回调
 * @param allianceDoc
 * @param event
 * @param callback
 */
pro.onShrineEvents = function(allianceDoc, event, callback){
	var self = this
	var allianceData = {}
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []
	LogicUtils.removeItemInArray(allianceDoc.shrineEvents, event)
	allianceData.__shrineEvents = [{
		type:Consts.DataChangedType.Remove,
		data:event
	}]

	var playerDocs = {}
	var playerTroopsForFight = []
	var funcs = []
	var findPlayerDoc = function(playerId){
		return self.playerDao.findByIdAsync(playerId, true).then(function(doc){
			if(!_.isObject(doc)) return Promise.reject(new Error("玩家不存在"))
			playerDocs[doc._id] = doc
			return Promise.resolve()
		})
	}
	var getTotalPower = function(soldiersForFight){
		var power = 0
		_.each(soldiersForFight, function(soldierForFight){
			power += soldierForFight.power * soldierForFight.totalCount
		})
		return power
	}
	var createDragonFightData = function(dragonAfterFight){
		var data = {
			type:dragonAfterFight.type,
			hpMax:dragonAfterFight.maxHp,
			hp:dragonAfterFight.totalHp,
			hpDecreased:dragonAfterFight.totalHp - dragonAfterFight.currentHp,
			isWin:dragonAfterFight.isWin
		}
		return data
	}
	_.each(event.playerTroops, function(playerTroop){
		funcs.push(findPlayerDoc(playerTroop.id))
	})
	Promise.all(funcs).then(function(){
		_.each(event.playerTroops, function(playerTroop){
			var playerDoc = playerDocs[playerTroop.id]
			var dragonForFight = DataUtils.createPlayerDragonForFight(playerDoc, playerDoc.dragons[playerTroop.dragon.type])
			var soldiersForFight = DataUtils.createPlayerSoldiersForFight(playerDoc, playerTroop.soldiers)
			var playerTroopForFight = {
				id:playerTroop.id,
				name:playerTroop.name,
				dragonForFight:dragonForFight,
				soldiersForFight:soldiersForFight,
				woundedSoldierPercent:DataUtils.getPlayerDamagedSoldierToWoundedSoldierPercent(playerDocs[playerTroop.id])
			}
			playerTroopsForFight.push(playerTroopForFight)
		})
		playerTroopsForFight = _.sortBy(playerTroopsForFight, function(playerTroopForFight){
			return -getTotalPower(playerTroopForFight.soldiersForFight)
		})

		var stageTroopsForFight = DataUtils.getAllianceShrineStageTroops(event.stageName)
		var playerAvgPower = LogicUtils.getPlayerTroopsAvgPower(playerTroopsForFight)
		var currentRound = 1
		var playerSuccessedTroops = []
		var stageSuccessedTroops = []
		var fightDatas = []
		while(playerTroopsForFight.length > 0 && stageTroopsForFight.length > 0){
			var playerTroopForFight = playerTroopsForFight[0]
			var stageTroopForFight = stageTroopsForFight[0]
			var dragonFightFixedEffect = DataUtils.getDragonFightFixedEffect(playerTroopForFight.soldiersForFight, stageTroopForFight.soldiersForFight)
			var dragonFightData = FightUtils.dragonToDragonFight(playerTroopForFight.dragonForFight, stageTroopForFight.dragonForFight, dragonFightFixedEffect)
			var soldierFightData = FightUtils.soldierToSoldierFight(playerTroopForFight.soldiersForFight, playerTroopForFight.woundedSoldierPercent, stageTroopForFight.soldiersForFight, 0)
			if(_.isEqual(soldierFightData.fightResult, Consts.FightResult.AttackWin)){
				playerSuccessedTroops.push(playerTroopForFight)
			}else{
				stageSuccessedTroops.push(stageTroopForFight)
			}
			LogicUtils.removeItemInArray(playerTroopsForFight, playerTroopForFight)
			LogicUtils.removeItemInArray(stageTroopsForFight, stageTroopForFight)
			LogicUtils.resetFightSoldiersByFightResult(playerTroopForFight.soldiersForFight, soldierFightData.attackRoundDatas)
			LogicUtils.resetFightSoldiersByFightResult(stageTroopForFight.soldiersForFight, soldierFightData.defenceRoundDatas)
			playerTroopForFight.dragonForFight.totalHp = dragonFightData.attackDragonAfterFight.currentHp
			playerTroopForFight.dragonForFight.currentHp = dragonFightData.attackDragonAfterFight.currentHp
			stageTroopForFight.dragonForFight.totalHp = dragonFightData.defenceDragonAfterFight.currentHp
			stageTroopForFight.dragonForFight.currentHp = dragonFightData.defenceDragonAfterFight.currentHp

			var currentFightData = null
			if(fightDatas.length < currentRound){
				currentFightData = {
					roundDatas:[]
				}
				fightDatas.push(currentFightData)
			}else{
				currentFightData = fightDatas[currentRound - 1]
			}
			var currentRoundDatas = currentFightData.roundDatas
			currentRoundDatas.push({
				playerId:playerTroopForFight.id,
				playerName:playerTroopForFight.name,
				stageTroopNumber:stageTroopForFight.troopNumber,
				fightResult:soldierFightData.fightResult,
				attackDragonFightData:createDragonFightData(dragonFightData.attackDragonAfterFight),
				defenceDragonFightData:createDragonFightData(dragonFightData.defenceDragonAfterFight),
				attackSoldierRoundDatas:soldierFightData.attackRoundDatas,
				defenceSoldierRoundDatas:soldierFightData.defenceRoundDatas
			})

			if((playerTroopsForFight.length == 0 && playerSuccessedTroops.length > 0) || (stageTroopsForFight.length == 0 && stageSuccessedTroops.length > 0)){
				if(playerTroopsForFight.length == 0 && playerSuccessedTroops.length > 0){
					_.each(playerSuccessedTroops, function(troop){
						if(troop.dragonForFight.maxHp > 0) playerTroopsForFight.push(troop)
					})
					LogicUtils.clearArray(playerSuccessedTroops)
				}
				if(stageTroopsForFight.length == 0 && stageSuccessedTroops.length > 0){
					_.each(stageSuccessedTroops, function(troop){
						if(troop.dragonForFight.maxHp > 0) stageTroopsForFight.push(troop)
					})
					LogicUtils.clearArray(stageSuccessedTroops)
				}
				currentRound += 1
			}
		}

		var params = DataUtils.getAllianceShrineStageResultDatas(event.stageName, playerTroopsForFight.length > 0, fightDatas)
		var playerDatas = LogicUtils.fixAllianceShrineStagePlayerData(event.playerTroops, params.playerDatas)
		var fightStar = params.fightStar
		var shrineReport = {
			id:ShortId.generate(),
			stageName:event.stageName,
			star:fightStar,
			playerCount:event.playerTroops.length,
			playerAvgPower:playerAvgPower,
			playerDatas:playerDatas,
			fightDatas:fightDatas
		}
		allianceData.__shrineReports = []
		if(allianceDoc.shrineReports.length > Define.AllianceShrineReportsMaxSize){
			var willRemovedshrineReport = allianceDoc.shrineReports.shift()
			allianceData.__shrineReports.push({
				type:Consts.DataChangedType.Remove,
				data:willRemovedshrineReport
			})
		}
		allianceDoc.shrineReports.push(shrineReport)
		allianceData.__shrineReports.push({
			type:Consts.DataChangedType.Add,
			data:shrineReport
		})
		if(fightStar > 0){
			var honour = DataUtils.getAllianceShrineStageFightHoner(event.stageName, fightStar)
			allianceDoc.basicInfo.honour += honour
			allianceData.basicInfo = allianceDoc.basicInfo
		}

		var stageData = LogicUtils.getAllianceShrineStageData(allianceDoc, event.stageName)
		if(!_.isObject(stageData)){
			stageData = {
				stageName:event.stageName,
				maxStar:fightStar
			}
			allianceDoc.shrineDatas.push(stageData)
			allianceData.__shrineDatas = [{
				type:Consts.DataChangedType.Add,
				data:stageData
			}]
		}else if(stageData.maxStar < fightStar){
			stageData.maxStar = fightStar
			allianceData.__shrineDatas = [{
				type:Consts.DataChangedType.Edit,
				data:stageData
			}]
		}
		var getLeftSoldiers = function(soldiers, damagedSoldiers){
			var leftSoldiers = []
			_.each(soldiers, function(soldier){
				var damagedSoldier = _.find(damagedSoldiers, function(damagedSoldier){
					return _.isEqual(soldier.name, damagedSoldier.name)
				})
				if(_.isObject(damagedSoldier)) soldier.count -= damagedSoldier.count
				if(soldier.count > 0) leftSoldiers.push(soldier)
			})
			return leftSoldiers
		}

		_.each(event.playerTroops, function(playerTroop){
			var playerId = playerTroop.id
			var playerDoc = playerDocs[playerId]
			var woundedSoldiers = _.isObject(params.woundedSoldiers[playerId]) ? params.woundedSoldiers[playerId] : []
			var leftSoldiers = _.isObject(params.damagedSoldiers[playerId]) ? getLeftSoldiers(playerTroop.soldiers, params.damagedSoldiers[playerId]) : playerTroop.soldiers
			var rewards = _.isObject(params.playerRewards[playerId]) ? params.playerRewards[playerId] : []
			var kill = _.isNumber(params.playerKills[playerId]) ? params.playerKills[playerId] : 0
			var dragon = playerDoc.dragons[playerTroop.dragon.type]
			var dragonHpDecreased = _.isNumber(params.playerDragonHps[playerId]) ? params.playerDragonHps[playerId] : 0
			var dragonExpAdd = DataUtils.getDragonExpAdd(kill)
			DataUtils.updatePlayerDragonProperty(playerDoc, dragon, dragonHpDecreased, dragonExpAdd)

			var playerData = {}
			playerData.dragons = {}
			playerData.dragons[dragon.type] = playerDoc.dragons[dragon.type]
			updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

			var marchReturnEvent = MarchUtils.createAttackAllianceShrineMarchReturnEvent(allianceDoc, playerDoc, dragon, leftSoldiers, woundedSoldiers, rewards)
			allianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
			allianceData.__attackMarchReturnEvents = [{
				type:Consts.DataChangedType.Add,
				data:marchReturnEvent
			}]
			updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
			eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, allianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
		})
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc._id, allianceData])
		LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(allianceDoc, allianceData, pushFuncs, self.pushService)
		return Promise.resolve()
	}).then(function(){
		callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
	}).catch(function(e){
		var funcs = []
		_.each(_.values(playerDocs), function(playerDoc){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		})
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
 * 村落采集事件回调
 * @param allianceDoc
 * @param event
 * @param callback
 */
pro.onVillageEvents = function(allianceDoc, event, callback){
	var self = this
	var attackAllianceDoc = allianceDoc
	var attackAllianceData = {}
	var defenceAllianceDoc = null
	var defenceAllianceData = null
	var attackPlayerDoc = null
	var attackPlayerData = {}
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []

	LogicUtils.removeItemInArray(allianceDoc.villageEvents, event)
	attackAllianceData.__villageEvents = [{
		type:Consts.DataChangedType.Remove,
		data:event
	}]
	Promise.resolve(function(){
		var funcs = []
		funcs.push(self.playerDao.findByIdAsync(event.playerData.id, true))
		if(!_.isEqual(event.playerData.alliance.id, event.villageData.alliance.id)){
			funcs.push(self.allianceDao.findByIdAsync(event.villageData.alliance.id, true))
		}
		return Promise.all(funcs)
	}()).spread(function(doc_1, doc_2){
		if(!_.isObject(doc_1)) return Promise.reject(new Error("玩家不存在"))
		attackPlayerDoc = doc_1
		if(!_.isEqual(event.playerData.alliance.id, event.villageData.alliance.id)){
			if(!_.isObject(doc_2)) return Promise.reject(new Error("联盟不存在"))
			defenceAllianceDoc = doc_2
			defenceAllianceData = {}
		}else{
			defenceAllianceDoc = attackAllianceDoc
			defenceAllianceData = attackAllianceData
		}

		var village = LogicUtils.getAllianceVillageById(defenceAllianceDoc, event.villageData.id)
		var originalRewards = event.playerData.rewards
		var resourceType = village.type.slice(0, -7)
		var newRewards = [{
			type:"resources",
			name:resourceType,
			count:event.villageData.collectTotal
		}]
		LogicUtils.mergeRewards(originalRewards, newRewards)

		var marchReturnEvent = MarchUtils.createAttackVillageMarchReturnEvent(attackAllianceDoc, attackPlayerDoc, event.playerData.dragon, event.playerData.soldiers, event.playerData.woundedSoldiers, defenceAllianceDoc, village, originalRewards)
		eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, "attackMarchReturnEvents", marchReturnEvent.id, marchReturnEvent.arriveTime])
		attackAllianceDoc.attackMarchReturnEvents.push(marchReturnEvent)
		attackAllianceData.__attackMarchReturnEvents = [{
			type:Consts.DataChangedType.Add,
			data:marchReturnEvent
		}]

		var collectReport = ReportUtils.createCollectVillageReport(defenceAllianceDoc, village, newRewards)
		LogicUtils.addPlayerReport(attackPlayerDoc, attackPlayerData, collectReport)
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, attackPlayerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, attackPlayerDoc, attackPlayerData])

		if(village.level > 1){
			village.level -= 1
			var dragonAndSoldiers = DataUtils.getAllianceVillageConfigedDragonAndSoldiers(village.type, village.level)
			village.dragon = dragonAndSoldiers.dragon
			village.soldiers = dragonAndSoldiers.soldiers
			village.resource = DataUtils.getAllianceVillageProduction(village.type, village.level)
			defenceAllianceData.__villages = [{
				type:Consts.DataChangedType.Edit,
				data:village
			}]
		}else{
			LogicUtils.removeItemInArray(defenceAllianceDoc.villages, village)
			defenceAllianceData.__villages = [{
				type:Consts.DataChangedType.Remove,
				data:village
			}]
			var villageInMap = LogicUtils.findAllianceMapObjectByLocation(defenceAllianceDoc, village.location)
			LogicUtils.removeItemInArray(defenceAllianceDoc.mapObjects, villageInMap)
			defenceAllianceData.__mapObjects = [{
				type:Consts.DataChangedType.Remove,
				data:villageInMap
			}]
		}

		if(attackAllianceDoc != defenceAllianceDoc){
			updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc])
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
			LogicUtils.putAllianceDataToEnemyAllianceData(defenceAllianceData, attackAllianceData)
			LogicUtils.putAllianceDataToEnemyAllianceData(attackAllianceDoc, defenceAllianceData)
		}else{
			LogicUtils.pushAllianceDataToEnemyAllianceIfNeeded(attackAllianceDoc, attackAllianceData, pushFuncs, self.pushService)
		}
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
		return Promise.resolve()
	}).then(function(){
		callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
	}).catch(function(e){
		var funcs = []
		if(_.isObject(attackPlayerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(attackPlayerDoc._id))
		}
		if(attackPlayerDoc != defenceAllianceDoc && _.isObject(defenceAllianceDoc)){
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
 * 联盟战斗准备状态事件回调
 * @param attackAllianceDoc
 * @param defenceAllianceDoc
 * @param callback
 */
pro.onAllianceFightPrepare = function(attackAllianceDoc, defenceAllianceDoc, callback){
	var self = this
	var attackAllianceData = {}
	var defenceAllianceData = {}
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []

	var now = Date.now()
	var statusFinishTime = now + DataUtils.getAllianceFightTotalFightTime()
	attackAllianceDoc.basicInfo.status = Consts.AllianceStatus.Fight
	attackAllianceDoc.basicInfo.statusStartTime = now
	attackAllianceDoc.basicInfo.statusFinishTime = statusFinishTime
	attackAllianceData.basicInfo = attackAllianceDoc.basicInfo
	defenceAllianceDoc.basicInfo.status = Consts.AllianceStatus.Fight
	defenceAllianceDoc.basicInfo.statusStartTime = now
	defenceAllianceDoc.basicInfo.statusFinishTime = statusFinishTime
	defenceAllianceData.basicInfo = defenceAllianceDoc.basicInfo

	eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceFightTimeEventAsync, attackAllianceDoc, defenceAllianceDoc, statusFinishTime])
	updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, attackAllianceDoc, true])
	updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc, true])
	pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
	pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
	callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
}

/**
 * 联盟战战斗中事件回调
 * @param attackAllianceDoc
 * @param defenceAllianceDoc
 * @param callback
 */
pro.onAllianceFightFighting = function(attackAllianceDoc, defenceAllianceDoc, callback){
	var self = this
	var attackAllianceData = {}
	var defenceAllianceData = {}
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []

	var now = Date.now()
	attackAllianceDoc.basicInfo.status = Consts.AllianceStatus.Protect
	attackAllianceDoc.basicInfo.statusStartTime = now
	var attackAllianceProtectTime = DataUtils.getAllianceProtectTimeAfterAllianceFight(attackAllianceDoc)
	attackAllianceDoc.basicInfo.statusFinishTime = now + attackAllianceProtectTime
	attackAllianceData.basicInfo = attackAllianceDoc.basicInfo
	attackAllianceData.enemyAllianceDoc = {}

	defenceAllianceDoc.basicInfo.status = Consts.AllianceStatus.Protect
	defenceAllianceDoc.basicInfo.statusStartTime = now
	var defenceAllianceProtectTime = DataUtils.getAllianceProtectTimeAfterAllianceFight(defenceAllianceDoc)
	defenceAllianceDoc.basicInfo.statusFinishTime = now + defenceAllianceProtectTime
	defenceAllianceData.basicInfo = attackAllianceDoc.basicInfo
	defenceAllianceData.enemyAllianceDoc = {}

	var attackAllianceKill = attackAllianceDoc.allianceFight.attackAllianceCountData.kill
	var defenceAllianceKill = attackAllianceDoc.allianceFight.defenceAllianceCountData.kill
	var allianceFightReport = {
		id:ShortId.generate(),
		fightResult:attackAllianceKill >= defenceAllianceKill ? Consts.FightResult.AttackWin : Consts.FightResult.DefenceWin,
		fightTime:now,
		attackAlliance:{
			id:attackAllianceDoc._id,
			name:attackAllianceDoc.basicInfo.name,
			tag:attackAllianceDoc.basicInfo.tag,
			flag:attackAllianceDoc.basicInfo.flag,
			kill:attackAllianceKill,
			routCount:attackAllianceDoc.allianceFight.attackAllianceCountData.routCount,
			strikeCount:attackAllianceDoc.allianceFight.attackAllianceCountData.strikeCount,
			strikeSuccessCount:attackAllianceDoc.allianceFight.attackAllianceCountData.strikeSuccessCount,
			attackCount:attackAllianceDoc.allianceFight.attackAllianceCountData.attackCount,
			attackSuccessCount:attackAllianceDoc.allianceFight.attackAllianceCountData.attackSuccessCount
		},
		defenceAlliance:{
			id:defenceAllianceDoc._id,
			name:defenceAllianceDoc.basicInfo.name,
			tag:defenceAllianceDoc.basicInfo.tag,
			flag:defenceAllianceDoc.basicInfo.flag,
			kill:defenceAllianceKill,
			routCount:attackAllianceDoc.allianceFight.defenceAllianceCountData.routCount,
			strikeCount:attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeCount,
			strikeSuccessCount:attackAllianceDoc.allianceFight.defenceAllianceCountData.strikeSuccessCount,
			attackCount:attackAllianceDoc.allianceFight.defenceAllianceCountData.attackCount,
			attackSuccessCount:attackAllianceDoc.allianceFight.defenceAllianceCountData.attackSuccessCount
		}
	}

	var willRemovedReport = null
	attackAllianceData.__allianceFightReports = []
	if(attackAllianceDoc.allianceFightReports.length >= Define.AllianceFightReportsMaxSize){
		willRemovedReport = attackAllianceDoc.allianceFightReports.shift()
		attackAllianceData.__allianceFightReports.push({
			type:Consts.DataChangedType.Remove,
			data:willRemovedReport
		})
	}
	attackAllianceDoc.allianceFightReports.push(allianceFightReport)
	attackAllianceData.__allianceFightReports.push({
		type:Consts.DataChangedType.Add,
		data:allianceFightReport
	})
	defenceAllianceData.__allianceFightReports = []
	if(defenceAllianceDoc.allianceFightReports.length >= Define.AllianceFightReportsMaxSize){
		willRemovedReport = defenceAllianceDoc.allianceFightReports.shift()
		defenceAllianceData.__allianceFightReports.push({
			type:Consts.DataChangedType.Remove,
			data:willRemovedReport
		})
	}
	defenceAllianceDoc.allianceFightReports.push(allianceFightReport)
	defenceAllianceData.__allianceFightReports.push({
		type:Consts.DataChangedType.Add,
		data:allianceFightReport
	})

	LogicUtils.updateAllianceCountInfo(attackAllianceDoc, defenceAllianceDoc)
	attackAllianceData.countInfo = attackAllianceDoc.countInfo
	defenceAllianceData.countInfo = defenceAllianceDoc.countInfo

	eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, attackAllianceDoc, Consts.AllianceStatusEvent, Consts.AllianceStatusEvent, attackAllianceDoc.basicInfo.statusFinishTime])
	eventFuncs.push([self.timeEventService, self.timeEventService.addAllianceTimeEventAsync, defenceAllianceDoc, Consts.AllianceStatusEvent, Consts.AllianceStatusEvent, defenceAllianceDoc.basicInfo.statusFinishTime])
	pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, attackAllianceDoc._id, attackAllianceData])
	pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, defenceAllianceDoc._id, defenceAllianceData])
	updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, attackAllianceDoc, true])
	updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, defenceAllianceDoc, true])
	callback(null, CreateResponse(updateFuncs, eventFuncs, pushFuncs))
}