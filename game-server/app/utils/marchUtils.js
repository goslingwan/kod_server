"use strict"

/**
 * Created by modun on 14/12/12.
 */

var ShortId = require("shortid")
var _ = require("underscore")
var Promise = require("bluebird")

var DataUtils = require("./dataUtils")
var Consts = require("../consts/consts")
var Define = require("../consts/define")
var LogicUtils = require("./logicUtils")

var GameDatas = require("../datas/GameDatas")
var AllianceInit = GameDatas.AllianceInitData
var UnitConfig = GameDatas.UnitsConfig

var Utils = module.exports

var AllianceMapSize = {
	width:AllianceInit.intInit.allianceRegionMapWidth.value,
	height:AllianceInit.intInit.allianceRegionMapHeight
}

/**
 * 获取距离
 * @param width
 * @param height
 * @returns {number}
 */
var getDistance = function(width, height){
	return Math.ceil(Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2)))
}
/**
 * 获取行军时间
 * @param playerDoc
 * @param width
 * @param height
 * @returns {number}
 */
var getMarchTime = function(playerDoc, width, height){
	var distance = getDistance(width, height)
	console.log(width, height, "---------------------------------------------")
	console.log(distance, "-----------------------------------------")
	var time = AllianceInit.intInit.allianceRegionMapBaseTimePerGrid.value * distance * 1000
	return time//5 * 1000
}

/**
 * 获取按战斗力排序后的兵力信息
 * @param playerDoc
 * @param soldiers
 * @returns {*}
 */
var getSortedSoldiers = function(playerDoc, soldiers){
	var config = null
	var sortedSoldiers = _.sortBy(soldiers, function(soldier){
		if(DataUtils.hasNormalSoldier(soldier.name)){
			var soldierFullKey = soldier.name + "_" + 1
			config = UnitConfig.normal[soldierFullKey]
			return - config.power * soldier.count
		}else{
			config = UnitConfig.special[soldier.name]
			return - config.power * soldier.count
		}
	})
	return sortedSoldiers
}

/**
 * 创建行军事件中联盟信息数据
 * @param allianceDoc
 * @returns {{id: *, name: *, tag: *}}
 */
var createAllianceData = function(allianceDoc){
	var allianceData = {
		id:allianceDoc._id,
		name:allianceDoc.basicInfo.name,
		tag:allianceDoc.basicInfo.tag
	}
	return allianceData
}

/**
 * 创建进攻行军事件中进攻玩家信息
 * @param allianceDoc
 * @param playerDoc
 * @param playerLocation
 * @param dragon
 * @param soldiers
 * @returns {*}
 */
var createAttackPlayerData = function(allianceDoc, playerDoc, playerLocation, dragon, soldiers){
	var playerData = {
		id:playerDoc._id,
		name:playerDoc.basicInfo.name,
		cityName:playerDoc.basicInfo.cityName,
		location:playerLocation,
		dragon:{
			type:dragon.type
		},
		soldiers:getSortedSoldiers(playerDoc, soldiers),
		alliance:createAllianceData(allianceDoc)
	}
	return playerData
}

/**
 * 创建进攻回城行军事件中进攻玩家信息
 * @param allianceDoc
 * @param playerDoc
 * @param playerLocation
 * @param dragon
 * @param soldiers
 * @param woundedSoldiers
 * @param rewards
 * @returns {*}
 */
var createAttackPlayerReturnData = function(allianceDoc, playerDoc, playerLocation, dragon, soldiers, woundedSoldiers, rewards){
	var playerData = {
		id:playerDoc._id,
		name:playerDoc.basicInfo.name,
		cityName:playerDoc.basicInfo.cityName,
		location:playerLocation,
		dragon:{
			type:dragon.type
		},
		soldiers:getSortedSoldiers(playerDoc, soldiers),
		alliance:createAllianceData(allianceDoc),
		woundedSoldiers:woundedSoldiers,
		rewards:rewards
	}
	return playerData
}

/**
 * 创建突袭行军事件中进攻玩家个人信息
 * @param allianceDoc
 * @param playerDoc
 * @param playerLocation
 * @param dragon
 * @returns {*}
 */
var createStrikePlayerData = function(allianceDoc, playerDoc, playerLocation, dragon){
	var playerData = {
		id:playerDoc._id,
		name:playerDoc.basicInfo.name,
		cityName:playerDoc.basicInfo.cityName,
		location:playerLocation,
		dragon:{
			type:dragon.type
		},
		alliance:createAllianceData(allianceDoc)
	}
	return playerData
}

/**
 * 创建突袭回城行军事件中进攻玩家信息
 * @param allianceDoc
 * @param playerDoc
 * @param playerLocation
 * @param dragon
 * @param rewards
 * @returns {*}
 */
var createStrikePlayerReturnData = function(allianceDoc, playerDoc, playerLocation, dragon, rewards){
	var playerData = {
		id:playerDoc._id,
		name:playerDoc.basicInfo.name,
		cityName:playerDoc.basicInfo.cityName,
		location:playerLocation,
		dragon:{
			type:dragon.type
		},
		alliance:createAllianceData(allianceDoc),
		rewards:rewards
	}
	return playerData
}


/**
 * 获取玩家行军时间
 * @param playerDoc
 * @param fromAllianceDoc
 * @param fromLocation
 * @param toAllianceDoc
 * @param toLocation
 */
Utils.getPlayerMarchTime = function(playerDoc, fromAllianceDoc, fromLocation, toAllianceDoc, toLocation){
	var width = 0
	var height = 0

	if(fromAllianceDoc == toAllianceDoc){
		width = Math.abs(fromLocation.x - toLocation.x)
		height = Math.abs(fromLocation.y - toLocation.y)
		return getMarchTime(playerDoc, width, height)
	}

	if(_.isEqual(fromAllianceDoc._id, fromAllianceDoc.allianceFight.attackAllianceId)){
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[0])){
			width = AllianceMapSize.width - fromLocation.x + toLocation.x
			height = Math.abs(fromLocation.y - toLocation.y)
			return getMarchTime(playerDoc, width, height)
		}
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[1])){
			width = AllianceMapSize.width - toLocation.x + fromLocation.x
			height = Math.abs(fromLocation.y - toLocation.y)
			return getMarchTime(playerDoc, width, height)
		}
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[2])){
			width = Math.abs(fromLocation.x - toLocation.x)
			height = AllianceMapSize.height - fromLocation.y + toLocation.y
			return getMarchTime(playerDoc, width, height)
		}
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[3])){
			width = Math.abs(fromLocation.x - toLocation.x)
			height = AllianceMapSize.height - toLocation.y + fromLocation.y
			return getMarchTime(playerDoc, width, height)
		}
	}else{
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[0])){
			width = AllianceMapSize.width - toLocation.x + fromLocation.x
			height = Math.abs(fromLocation.y - toLocation.y)
			return getMarchTime(playerDoc, width, height)
		}
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[1])){
			width = AllianceMapSize.width - fromLocation.x + toLocation.x
			height = Math.abs(fromLocation.y - toLocation.y)
			return getMarchTime(playerDoc, width, height)
		}
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[2])){
			width = Math.abs(fromLocation.x - toLocation.x)
			height = AllianceMapSize.height - toLocation.y + fromLocation.y
			return getMarchTime(playerDoc, width, height)
		}
		if(_.isEqual(fromAllianceDoc.allianceFight.mergeStyle, Consts.AllianceMergeStyle[3])){
			width = Math.abs(fromLocation.x - toLocation.x)
			height = AllianceMapSize.height - fromLocation.y + toLocation.y
			return getMarchTime(playerDoc, width, height)
		}
	}

	return 0
}

/**
 * 创建联盟圣地行军事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param shrineEventId
 * @returns {*}
 */
Utils.createAttackAllianceShrineMarchEvent = function(allianceDoc, playerDoc, dragon, soldiers, shrineEventId){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var shrineLocation = allianceDoc.buildings["shrine"].location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, allianceDoc, shrineLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.Shrine,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerData(allianceDoc, playerDoc, playerLocation, dragon, soldiers),
		defenceShrineData:{
			shrineEventId:shrineEventId,
			location:shrineLocation,
			alliance:createAllianceData(allianceDoc)
		}
	}
	return event
}

/**
 * 玩家从圣地回城事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param woundedSoldiers
 * @param rewards
 * @returns {*}
 */
Utils.createAttackAllianceShrineMarchReturnEvent = function(allianceDoc, playerDoc, dragon, soldiers, woundedSoldiers, rewards){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var shrineLocation = allianceDoc.buildings["shrine"].location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, shrineLocation, allianceDoc, playerLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.Shrine,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerReturnData(allianceDoc, playerDoc, playerLocation, dragon, soldiers, woundedSoldiers, rewards),
		defenceShrineData:{
			location:shrineLocation,
			alliance:createAllianceData(allianceDoc)
		}
	}
	return event
}

/**
 * 创建联盟协防事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param beHelpedPlayerDoc
 * @returns {*}
 */
Utils.createHelpDefenceMarchEvent = function(allianceDoc, playerDoc, dragon, soldiers, beHelpedPlayerDoc){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var beHelpedPlayerLocation = LogicUtils.getAllianceMemberById(allianceDoc, beHelpedPlayerDoc._id).location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, allianceDoc, beHelpedPlayerLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.HelpDefence,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerData(allianceDoc, playerDoc, playerLocation, dragon, soldiers),
		defencePlayerData:{
			id:beHelpedPlayerDoc._id,
			name:beHelpedPlayerDoc.basicInfo.name,
			cityName:beHelpedPlayerDoc.basicInfo.cityName,
			location:beHelpedPlayerLocation,
			alliance:createAllianceData(allianceDoc)
		}
	}
	return event
}

/**
 * 创建玩家协助防御回城事件
 * @param allianceDoc
 * @param playerDoc
 * @param beHelpedPlayerDoc
 * @param dragon
 * @param soldiers
 * @param woundedSoldiers
 * @param rewards
 * @returns {*}
 */
Utils.createHelpDefenceMarchReturnEvent = function(allianceDoc, playerDoc, beHelpedPlayerDoc, dragon, soldiers, woundedSoldiers, rewards){
	var beHelpedPlayerLocation = LogicUtils.getAllianceMemberById(allianceDoc, beHelpedPlayerDoc._id).location
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, beHelpedPlayerLocation, allianceDoc, playerLocation)
	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.HelpDefence,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerReturnData(allianceDoc, playerDoc, playerLocation, dragon, soldiers, woundedSoldiers, rewards),
		defencePlayerData:{
			id:beHelpedPlayerDoc._id,
			name:beHelpedPlayerDoc.basicInfo.name,
			cityName:beHelpedPlayerDoc.basicInfo.cityName,
			location:beHelpedPlayerLocation,
			alliance:createAllianceData(allianceDoc)
		}
	}
	return event
}

/**
 * 创建突袭玩家城市行军事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param defenceAllianceDoc
 * @param defencePlayerDoc
 * @returns {*}
 */
Utils.createStrikePlayerCityMarchEvent = function(allianceDoc, playerDoc, dragon, defenceAllianceDoc, defencePlayerDoc){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defencePlayerLocation = LogicUtils.getAllianceMemberById(defenceAllianceDoc, defencePlayerDoc._id).location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defencePlayerLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.City,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createStrikePlayerData(allianceDoc, playerDoc, playerLocation, dragon),
		defencePlayerData:{
			id:defencePlayerDoc._id,
			name:defencePlayerDoc.basicInfo.name,
			cityName:defencePlayerDoc.basicInfo.cityName,
			location:defencePlayerLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建突袭玩家城市回城行军事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param defenceAllianceDoc
 * @param defencePlayerDoc
 * @param rewards
 * @returns {*}
 */
Utils.createStrikePlayerCityMarchReturnEvent = function(allianceDoc, playerDoc, dragon, defenceAllianceDoc, defencePlayerDoc, rewards){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defencePlayerLocation = LogicUtils.getAllianceMemberById(defenceAllianceDoc, defencePlayerDoc._id).location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defencePlayerLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.City,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createStrikePlayerReturnData(allianceDoc, playerDoc, playerLocation, dragon, rewards),
		defencePlayerData:{
			id:defencePlayerDoc._id,
			name:defencePlayerDoc.basicInfo.name,
			cityName:defencePlayerDoc.basicInfo.cityName,
			location:defencePlayerLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建进攻玩家城市行军事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param defenceAllianceDoc
 * @param defencePlayerDoc
 * @returns {*}
 */
Utils.createAttackPlayerCityMarchEvent = function(allianceDoc, playerDoc, dragon, soldiers, defenceAllianceDoc, defencePlayerDoc){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defencePlayerLocation = LogicUtils.getAllianceMemberById(defenceAllianceDoc, defencePlayerDoc._id).location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defencePlayerLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.City,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerData(allianceDoc, playerDoc, playerLocation, dragon, soldiers),
		defencePlayerData:{
			id:defencePlayerDoc._id,
			name:defencePlayerDoc.basicInfo.name,
			cityName:defencePlayerDoc.basicInfo.cityName,
			location:defencePlayerLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建进攻玩家城市行军回城事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param woundedSoldiers
 * @param defenceAllianceDoc
 * @param defencePlayerDoc
 * @param rewards
 * @returns {*}
 */
Utils.createAttackPlayerCityMarchReturnEvent = function(allianceDoc, playerDoc, dragon, soldiers, woundedSoldiers, defenceAllianceDoc, defencePlayerDoc, rewards){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defencePlayerLocation = LogicUtils.getAllianceMemberById(defenceAllianceDoc, defencePlayerDoc._id).location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defencePlayerLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.City,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerReturnData(allianceDoc, playerDoc, playerLocation, dragon, soldiers, woundedSoldiers, rewards),
		defencePlayerData:{
			id:defencePlayerDoc._id,
			name:defencePlayerDoc.basicInfo.name,
			cityName:defencePlayerDoc.basicInfo.cityName,
			location:defencePlayerLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建进攻联盟村落行军事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param defenceAllianceDoc
 * @param defenceVillage
 * @returns {*}
 */
Utils.createAttackVillageMarchEvent = function(allianceDoc, playerDoc, dragon, soldiers, defenceAllianceDoc, defenceVillage){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defenceVillageLocation = defenceVillage.location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defenceVillageLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.Village,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerData(allianceDoc, playerDoc, playerLocation, dragon, soldiers),
		defenceVillageData:{
			id:defenceVillage.id,
			type:defenceVillage.type,
			level:defenceVillage.level,
			location:defenceVillageLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建进攻联盟村落回城事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param woundedSoldiers
 * @param defenceAllianceDoc
 * @param defenceVillage
 * @param rewards
 * @returns {*}
 */
Utils.createAttackVillageMarchReturnEvent = function(allianceDoc, playerDoc, dragon, soldiers, woundedSoldiers, defenceAllianceDoc, defenceVillage, rewards){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defenceVillageLocation = defenceVillage.location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defenceVillageLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.Village,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createAttackPlayerReturnData(allianceDoc, playerDoc, playerLocation, dragon, soldiers, woundedSoldiers, rewards),
		defenceVillageData:{
			id:defenceVillage.id,
			type:defenceVillage.type,
			level:defenceVillage.level,
			location:defenceVillageLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建突袭联盟村落行军事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param defenceAllianceDoc
 * @param defenceVillage
 * @returns {*}
 */
Utils.createStrikeVillageMarchEvent = function(allianceDoc, playerDoc, dragon, defenceAllianceDoc, defenceVillage){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defenceVillageLocation = defenceVillage.location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defenceVillageLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.Village,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createStrikePlayerData(allianceDoc, playerDoc, playerLocation, dragon),
		defenceVillageData:{
			id:defenceVillage.id,
			type:defenceVillage.type,
			level:defenceVillage.level,
			location:defenceVillageLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建突袭联盟村落回城事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param defenceAllianceDoc
 * @param defenceVillage
 * @param rewards
 * @returns {*}
 */
Utils.createStrikeVillageMarchReturnEvent = function(allianceDoc, playerDoc, dragon, defenceAllianceDoc, defenceVillage, rewards){
	var playerLocation = LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location
	var defenceVillageLocation = defenceVillage.location
	var marchTime = this.getPlayerMarchTime(playerDoc, allianceDoc, playerLocation, defenceAllianceDoc, defenceVillageLocation)

	var event = {
		id:ShortId.generate(),
		marchType:Consts.MarchType.Village,
		startTime:Date.now(),
		arriveTime:Date.now() + marchTime,
		attackPlayerData:createStrikePlayerReturnData(allianceDoc, playerDoc, playerLocation, dragon, rewards),
		defenceVillageData:{
			id:defenceVillage.id,
			type:defenceVillage.type,
			level:defenceVillage.level,
			location:defenceVillageLocation,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}
	return event
}

/**
 * 创建采集联盟村落事件
 * @param allianceDoc
 * @param playerDoc
 * @param dragon
 * @param soldiers
 * @param woundedSoldiers
 * @param defenceAllianceDoc
 * @param defenceVillage
 * @param rewards
 * @returns {*}
 */
Utils.createAllianceVillageEvent = function(allianceDoc, playerDoc, dragon, soldiers, woundedSoldiers, defenceAllianceDoc, defenceVillage, rewards){
	var soldiersTotalLoad = DataUtils.getPlayerSoldiersTotalLoad(playerDoc, soldiers)
	var collectInfo = DataUtils.getPlayerCollectResourceInfo(playerDoc, soldiersTotalLoad, defenceVillage)
	var event = {
		id:ShortId.generate(),
		startTime:Date.now(),
		finishTime:Date.now() + collectInfo.collectTime,
		playerData:{
			id:playerDoc._id,
			name:playerDoc.basicInfo.name,
			cityName:playerDoc.basicInfo.cityName,
			location:LogicUtils.getAllianceMemberById(allianceDoc, playerDoc._id).location,
			alliance:createAllianceData(allianceDoc),
			dragon:{
				type:dragon.type
			},
			soldiers:soldiers,
			woundedSoldiers:woundedSoldiers,
			rewards:rewards
		},
		villageData:{
			id:defenceVillage.id,
			type:defenceVillage.type,
			level:defenceVillage.level,
			resource:defenceVillage.resource,
			collectTotal:collectInfo.collectTotal,
			location:defenceVillage.location,
			alliance:createAllianceData(defenceAllianceDoc)
		}
	}

	var data = {
		event:event,
		soldiersTotalLoad:soldiersTotalLoad,
		collectTime:collectInfo.collectTime,
		collectTotal:collectInfo.collectTotal
	}
	return data
}