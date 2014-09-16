"use strict"

/**
 * Created by modun on 14-7-23.
 */

var Promise = require("bluebird")
var _ = require("underscore")
var crypto = require('crypto')

var AllianceDao = require("../dao/allianceDao")
var PlayerDao = require("../dao/playerDao")

var DataUtils = require("../utils/dataUtils")
var LogicUtils = require("../utils/logicUtils")
var Events = require("../consts/events")
var errorLogger = require("pomelo/node_modules/pomelo-logger").getLogger("kod-error")
var errorMailLogger = require("pomelo/node_modules/pomelo-logger").getLogger("kod-mail-error")
var Consts = require("../consts/consts")

var PlayerService = function(app){
	this.app = app
	this.pushService = this.app.get("pushService")
	this.callbackService = this.app.get("callbackService")
	this.cacheService = this.app.get("cacheService")
	this.allianceDao = Promise.promisifyAll(new AllianceDao())
	this.playerDao = Promise.promisifyAll(new PlayerDao())
}

module.exports = PlayerService
var pro = PlayerService.prototype


/**
 * 玩家登陆逻辑服务器
 * @param playerId
 * @param frontServerId
 * @param callback
 */
pro.playerLogin = function(playerId, frontServerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(frontServerId)){
		callback(new Error("frontServerId 不合法"))
		return
	}

	var self = this
	this.cacheService.addPlayerAsync(playerId).then(function(doc){
		doc.frontServerId = frontServerId
		AfterLogin.call(self, doc)
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		self.pushService.onPlayerLoginSuccess(doc)
		callback(null, doc)
	}).catch(function(e){
		callback(e)
	})
}

var AfterLogin = function(doc){
	var self = this
	doc.countInfo.lastLoginTime = Date.now()
	doc.countInfo.loginCount += 1
	//刷新玩家资源数据
	self.refreshPlayerResources(doc)
	//检查建筑
	var buildingFinishedEvents = []
	_.each(doc.buildingEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			var building = LogicUtils.getBuildingByEvent(doc, event)
			building.level += 1
			//检查是否有建筑需要从-1级升级到0级
			LogicUtils.updateBuildingsLevel(doc)
			self.pushService.onBuildingLevelUp(doc, event.location)
			buildingFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(buildingFinishedEvents, doc.buildingEvents)
	//检查小屋
	var houseFinishedEvents = []
	_.each(doc.houseEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			var house = LogicUtils.getHouseByEvent(doc, event)
			house.level += 1
			self.pushService.onHouseLevelUp(doc, event.buildingLocation, event.houseLocation)
			//如果是住宅,送玩家城民
			if(_.isEqual("dwelling", house.type)){
				var previous = DataUtils.getDwellingPopulationByLevel(house.level - 1)
				var next = DataUtils.getDwellingPopulationByLevel(house.level)
				doc.resources.citizen += next - previous
				//刷新玩家资源数据
				self.refreshPlayerResources(doc)
			}
			houseFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(houseFinishedEvents, doc.houseEvents)
	//检查箭塔
	var towerFinishedEvents = []
	_.each(doc.towerEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			event.level += 1
			self.pushService.onTowerLevelUp(doc, event.location)
			towerFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(towerFinishedEvents, doc.towerEvents)
	//检查城墙
	var wallFinishedEvents = []
	_.each(doc.wallEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			var wall = doc.wall
			wall.level += 1
			self.pushService.onWallLevelUp(doc)
			wallFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(wallFinishedEvents, doc.wallEvents)
	//检查材料制造
	_.each(doc.materialEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			event.finishTime = 0
			self.pushService.onMakeMaterialFinished(doc, event)
		}else if(event.finishTime > 0){
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	//检查招募事件
	var soldierFinishedEvents = []
	_.each(doc.soldierEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			doc.soldiers[event.name] = event.count
			self.pushService.onRecruitSoldierSuccess(doc, event.name, event.count)
			soldierFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(soldierFinishedEvents, doc.soldierEvents)
	//检查龙装备制作事件
	var dragonEquipmentFinishedEvents = []
	_.each(doc.dragonEquipmentEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			doc.dragonEquipments[event.name] += 1
			self.pushService.onMakeDragonEquipmentSuccess(doc, event.name)
			dragonEquipmentFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(dragonEquipmentFinishedEvents, doc.dragonEquipmentEvents)
	//检查医院治疗伤兵事件
	var treatSoldierFinishedEvents = []
	_.each(doc.treatSoldierEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			_.each(event.soldiers, function(soldier){
				doc.soldiers[soldier.name] += soldier.count
				doc.treatSoldiers[soldier.name] -= soldier.count
			})
			self.pushService.onTreatSoldierSuccess(doc, event.soldiers)
			treatSoldierFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(treatSoldierFinishedEvents, doc.treatSoldierEvents)
	//检查城民税收事件
	var coinFinishedEvents = []
	_.each(doc.coinEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= Date.now()){
			doc.resources.coin += event.coin
			self.pushService.onImposeSuccess(doc, event.coin)
			coinFinishedEvents.push(event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
	})
	LogicUtils.removeEvents(coinFinishedEvents, doc.coinEvents)


	//刷新玩家战力
	self.refreshPlayerPower(doc)
}

/**
 * 玩家登出逻辑服
 * @param playerId
 * @param frontServerId
 * @param callback
 */
pro.playerLogout = function(playerId, frontServerId, callback){
	this.callbackService.removeAllPlayerCallback(playerId)
	this.cacheService.removePlayerAsync(playerId).then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 更新玩家资源数据
 * @param doc
 */
pro.refreshPlayerResources = function(doc){
	var resources = DataUtils.getPlayerResources(doc)
	_.each(resources, function(value, key){
		doc.resources[key] = value
	})
	doc.basicInfo.resourceRefreshTime = Date.now()
}

/**
 * 刷新玩家兵力信息
 * @param doc
 */
pro.refreshPlayerPower = function(doc){
	var power = DataUtils.getPlayerPower(doc)
	doc.basicInfo.power = power
}

/**
 * 升级大型建筑
 * @param playerId
 * @param buildingLocation
 * @param finishNow
 * @param callback
 */
pro.upgradeBuilding = function(playerId, buildingLocation, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(buildingLocation) || buildingLocation % 1 !== 0 || buildingLocation < 1 || buildingLocation > 25){
		callback(new Error("buildingLocation 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}

		var building = doc.buildings["location_" + buildingLocation]
		//检查建筑是否存在
		if(!_.isObject(building)){
			return Promise.reject(new Error("建筑不存在"))
		}
		//建筑是否正在升级中
		if(LogicUtils.hasBuildingEvents(doc, buildingLocation)){
			return Promise.reject(new Error("建筑正在升级"))
		}
		//检查是否小于0级
		if(building.level < 0){
			return Promise.reject(new Error("建筑还未建造"))
		}
		//检查升级坑位是否合法
		if(building.level == 0 && !LogicUtils.isBuildingCanCreateAtLocation(doc, buildingLocation)){
			return Promise.reject(new Error("建筑建造时,建筑坑位不合法"))
		}
		//检查建造数量是否超过上限
		if(building.level == 0 && DataUtils.getPlayerFreeBuildingsCount(doc) <= 0){
			return Promise.reject(new Error("建造数量已达建造上限"))
		}
		//检查升级等级是否合法
		if(!_.isEqual(building.type, "keep") && building.level > 0 && building.level + 1 > DataUtils.getBuildingLevelLimit(doc)){
			return Promise.reject(new Error("建筑升级时,建筑等级不合法"))
		}
		//是否已到最高等级
		if(building.level > 0 && DataUtils.isBuildingReachMaxLevel(building.type, building.level)){
			return Promise.reject(new Error("建筑已达到最高等级"))
		}
		//是否有可用的建造队列
		if(!finishNow && !DataUtils.hasFreeBuildQueue(doc)){
			return Promise.reject(new Error("没有空闲的建造队列"))
		}

		var gemUsed = 0
		var upgradeRequired = DataUtils.getBuildingUpgradeRequired(building.type, building.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, doc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}

		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(upgradeRequired.resources, doc.resources)
		LogicUtils.reduce(upgradeRequired.materials, doc.materials)
		//是否立即完成
		if(finishNow){
			building.level = building.level + 1
			//检查是否有建筑需要从-1级升级到0级
			LogicUtils.updateBuildingsLevel(doc)
			//刷新玩家战力
			self.refreshPlayerPower(doc)
			self.pushService.onBuildingLevelUp(doc, building.location)
		}else{
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addBuildingEvent(doc, building.location, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 创建小屋
 * @param playerId
 * @param buildingLocation
 * @param houseType
 * @param houseLocation
 * @param finishNow
 * @param callback
 */
pro.createHouse = function(playerId, buildingLocation, houseType, houseLocation, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(buildingLocation) || buildingLocation % 1 !== 0 || buildingLocation < 1 || buildingLocation > 25){
		callback(new Error("buildingLocation 不合法"))
		return
	}
	if(!_.isString(houseType)){
		callback(new Error("houseType 不合法"))
		return
	}
	if(!_.isNumber(houseLocation) || houseLocation % 1 !== 0 || houseLocation < 1 || houseLocation > 3){
		callback(new Error("houseLocation 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}
	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}

		var building = doc.buildings["location_" + buildingLocation]
		//检查建筑是否存在
		if(!_.isObject(building)){
			return Promise.reject(new Error("主体建筑不存在"))
		}
		//检查建筑等级是否大于1
		if(building.level <= 0){
			return Promise.reject(new Error("主体建筑必须大于等于1级"))
		}
		//检查小屋类型是否存在
		if(!DataUtils.isHouseTypeExist(houseType)){
			return Promise.reject(new Error("小屋类型不存在"))
		}
		//检查小屋个数是否超标
		if(DataUtils.getPlayerFreeHousesCount(doc, houseType) <= 0){
			return Promise.reject(new Error("小屋数量超过限制"))
		}
		//建筑周围不允许建造小屋
		if(!DataUtils.isBuildingHasHouse(buildingLocation)){
			return Promise.reject(new Error("建筑周围不允许建造小屋"))
		}
		//创建小屋时,小屋坑位是否合法
		if(!LogicUtils.isHouseCanCreateAtLocation(doc, buildingLocation, houseType, houseLocation)){
			return Promise.reject(new Error("创建小屋时,小屋坑位不合法"))
		}
		//检查是否建造小屋会造成可用城民小于0
		if(!_.isEqual("dwelling", houseType)){
			var willUse = DataUtils.getPlayerHouseUsedCitizen(houseType, 1)
			if(DataUtils.getPlayerCitizen(doc) - willUse < 0){
				return Promise.reject(new Error("建造小屋会造成可用城民小于0"))
			}
		}
		//是否有可用的建造队列
		if(!finishNow && !DataUtils.hasFreeBuildQueue(doc)){
			return Promise.reject(new Error("没有空闲的建造队列"))
		}

		var gemUsed = 0
		var upgradeRequired = DataUtils.getHouseUpgradeRequired(houseType, 1)
		var buyedResources = null
		var buyedMaterials = null
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, doc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}

		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(upgradeRequired.resources, doc.resources)
		LogicUtils.reduce(upgradeRequired.materials, doc.materials)
		//创建小屋
		var house = {
			type:houseType,
			level:0,
			location:houseLocation
		}
		//将小屋添加到大型建筑中
		building.houses.push(house)
		//是否立即完成
		if(finishNow){
			house.level += 1
			//刷新玩家战力
			self.refreshPlayerPower(doc)
			self.pushService.onHouseLevelUp(doc, building.location, house.location)
		}else{
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addHouseEvent(doc, buildingLocation, houseLocation, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//如果是住宅,送玩家城民
		if(_.isEqual("dwelling", house.type) && finishNow){
			var previous = DataUtils.getDwellingPopulationByLevel(house.level - 1)
			var next = DataUtils.getDwellingPopulationByLevel(house.level)
			doc.resources.citizen += next - previous
		}
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}


/**
 * 升级小屋
 * @param playerId
 * @param buildingLocation
 * @param houseLocation
 * @param finishNow
 * @param callback
 */
pro.upgradeHouse = function(playerId, buildingLocation, houseLocation, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(buildingLocation) || buildingLocation % 1 !== 0 || buildingLocation < 1 || buildingLocation > 25){
		callback(new Error("buildingLocation 不合法"))
		return
	}
	if(!_.isNumber(houseLocation) || houseLocation % 1 !== 0 || houseLocation < 1 || houseLocation > 3){
		callback(new Error("houseLocation 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}

		var building = doc.buildings["location_" + buildingLocation]
		//检查建筑是否存在
		if(!_.isObject(building)){
			return Promise.reject(new Error("主体建筑不存在"))
		}
		//检查建筑等级是否大于1
		if(building.level <= 0){
			return Promise.reject(new Error("主体建筑必须大于等于1级"))
		}
		//检查小屋是否存在
		var house = null
		_.each(building.houses, function(value){
			if(value.location == houseLocation){
				house = value
			}
		})
		if(!_.isObject(house)){
			return Promise.reject(new Error("小屋不存在"))
		}
		//检查小屋是否正在升级
		if(LogicUtils.hasHouseEvents(doc, building.location, house.location)){
			return Promise.reject(new Error("小屋正在升级"))
		}
		//检查等级是否合法
		if(house.level + 1 > DataUtils.getBuildingLevelLimit(doc)){
			return Promise.reject(new Error("小屋升级时,小屋等级不合法"))
		}
		//是否已到最高等级
		if(DataUtils.isHouseReachMaxLevel(house.type, house.level)){
			return Promise.reject(new Error("小屋已达到最高等级"))
		}
		//检查是否升级小屋会造成可用城民小于0
		if(!_.isEqual("dwelling", house.type)){
			var currentLevelUsed = DataUtils.getPlayerHouseUsedCitizen(house.type, house.level)
			var nextLevelUsed = DataUtils.getPlayerHouseUsedCitizen(house.type, house.level + 1)
			var willUse = nextLevelUsed - currentLevelUsed
			if(DataUtils.getPlayerCitizen(doc) - willUse < 0){
				return Promise.reject(new Error("升级小屋会造成可用城民小于0"))
			}
		}
		//是否有可用的建造队列
		if(!finishNow && !DataUtils.hasFreeBuildQueue(doc)){
			return Promise.reject(new Error("没有空闲的建造队列"))
		}

		var gemUsed = 0
		var upgradeRequired = DataUtils.getHouseUpgradeRequired(house.type, house.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, doc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}

		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(upgradeRequired.resources, doc.resources)
		LogicUtils.reduce(upgradeRequired.materials, doc.materials)
		//是否立即完成
		if(finishNow){
			house.level += 1
			//刷新玩家战力
			self.refreshPlayerPower(doc)
			self.pushService.onHouseLevelUp(doc, building.location, house.location)
		}else{
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addHouseEvent(doc, building.location, house.location, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//如果是住宅,送玩家城民
		if(_.isEqual("dwelling", house.type) && finishNow){
			var previous = DataUtils.getDwellingPopulationByLevel(house.level - 1)
			var next = DataUtils.getDwellingPopulationByLevel(house.level)
			doc.resources.citizen += next - previous
		}
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 拆除小屋
 * @param playerId
 * @param buildingLocation
 * @param houseLocation
 * @param callback
 */
pro.destroyHouse = function(playerId, buildingLocation, houseLocation, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(buildingLocation) || buildingLocation % 1 !== 0 || buildingLocation < 1 || buildingLocation > 25){
		callback(new Error("buildingLocation 不合法"))
		return
	}
	if(!_.isNumber(houseLocation) || houseLocation % 1 !== 0 || houseLocation < 1 || houseLocation > 3){
		callback(new Error("houseLocation 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}

		var building = doc.buildings["location_" + buildingLocation]
		//检查建筑是否存在
		if(!_.isObject(building)){
			return Promise.reject(new Error("主体建筑不存在"))
		}
		//检查小屋是否存在
		var house = null
		_.each(building.houses, function(value){
			if(value.location == houseLocation){
				house = value
			}
		})
		if(!_.isObject(house)){
			return Promise.reject(new Error("小屋不存在"))
		}
		//检查是否正在升级
		if(LogicUtils.hasHouseEvents(doc, building.location, house.location)){
			return Promise.reject(new Error("小屋正在升级"))
		}
		//更新资源数据
		self.refreshPlayerResources(doc)
		//删除小屋
		var index = building.houses.indexOf(house)
		building.houses.splice(index, 1)
		//更新资源数据
		self.refreshPlayerResources(doc)
		//检查是否在拆除民宅,且民宅拆除后,是否会造成城民数量小于0
		if(_.isEqual("dwelling", house.type) && DataUtils.getPlayerCitizen(doc) < 0){
			return Promise.reject(new Error("拆除此建筑后会造成可用城民数量小于0"))
		}
		//获取需要的宝石数量
		var gem = 100
		//宝石是否足够
		if(gem > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gem
		//退还资源和城民给玩家
		var returnedResources = DataUtils.getHouseDestroyReturned(house.type, house.level)
		LogicUtils.increace(returnedResources, doc.resources)
		//再次更新玩家数据,防止城民爆仓
		self.refreshPlayerResources(doc)
		//刷新玩家战力
		self.refreshPlayerPower(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 升级箭塔
 * @param playerId
 * @param towerLocation
 * @param finishNow
 * @param callback
 */
pro.upgradeTower = function(playerId, towerLocation, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(towerLocation) || towerLocation % 1 !== 0 || towerLocation < 1 || towerLocation > 11){
		callback(new Error("towerLocation 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}

		var tower = doc.towers["location_" + towerLocation]
		//检查箭塔是否存在
		if(!_.isObject(tower)){
			return Promise.reject(new Error("箭塔不存在"))
		}
		//箭塔是否正在升级中
		if(LogicUtils.hasTowerEvents(doc, tower.location)){
			return Promise.reject(new Error("箭塔正在升级"))
		}
		//检查是否小于1级
		if(tower.level < 1){
			return Promise.reject(new Error("箭塔还未建造"))
		}
		//是否已到最高等级
		if(DataUtils.isBuildingReachMaxLevel("tower", tower.level)){
			return Promise.reject(new Error("箭塔已达到最高等级"))
		}
		//检查升级等级是否合法
		if(tower.level + 1 > DataUtils.getBuildingLevelLimit(doc)){
			return Promise.reject(new Error("箭塔升级时,建筑等级不合法"))
		}
		//是否有可用的建造队列
		if(!finishNow && !DataUtils.hasFreeBuildQueue(doc)){
			return Promise.reject(new Error("没有空闲的建造队列"))
		}

		var gemUsed = 0
		var upgradeRequired = DataUtils.getBuildingUpgradeRequired("tower", tower.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, doc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}

		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(upgradeRequired.resources, doc.resources)
		LogicUtils.reduce(upgradeRequired.materials, doc.materials)
		//是否立即完成
		if(finishNow){
			tower.level = tower.level + 1
			//刷新玩家战力
			self.refreshPlayerPower(doc)
			self.pushService.onTowerLevelUp(doc, tower.location)
		}else{
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addTowerEvent(doc, tower.location, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 升级城墙
 * @param playerId
 * @param finishNow
 * @param callback
 */
pro.upgradeWall = function(playerId, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}

		var wall = doc.wall
		//检查城墙是否存在
		if(!_.isObject(wall)){
			return Promise.reject(new Error("城墙不存在"))
		}
		//城墙是否正在升级中
		if(LogicUtils.hasWallEvents(doc)){
			return Promise.reject(new Error("城墙正在升级"))
		}
		//检查是否小于1级
		if(wall.level < 1){
			return Promise.reject(new Error("城墙还未建造"))
		}
		//是否已到最高等级
		if(DataUtils.isBuildingReachMaxLevel("wall", wall.level)){
			return Promise.reject(new Error("城墙已达到最高等级"))
		}
		//检查升级等级是否合法
		if(wall.level + 1 > DataUtils.getBuildingLevelLimit(doc)){
			return Promise.reject(new Error("城墙升级时,城墙等级不合法"))
		}
		//是否有可用的建造队列
		if(!finishNow && !DataUtils.hasFreeBuildQueue(doc)){
			return Promise.reject(new Error("没有空闲的建造队列"))
		}

		var gemUsed = 0
		var upgradeRequired = DataUtils.getBuildingUpgradeRequired("wall", wall.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, doc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, doc.materials)
		}

		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(upgradeRequired.resources, doc.resources)
		LogicUtils.reduce(upgradeRequired.materials, doc.materials)
		//是否立即完成
		if(finishNow){
			wall.level = wall.level + 1
			//刷新玩家战力
			self.refreshPlayerPower(doc)
			self.pushService.onWallLevelUp(doc)
		}else{
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addWallEvent(doc, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 制造材料
 * @param playerId
 * @param category
 * @param finishNow
 * @param callback
 */
pro.makeMaterial = function(playerId, category, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.contains(Consts.MaterialType, category)){
		callback(new Error("category 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var toolShop = doc.buildings["location_5"]
		if(toolShop.level < 1){
			return Promise.reject(new Error("工具作坊还未建造"))
		}
		var event = null
		for(var i = 0; i < doc.materialEvents.length; i++){
			event = doc.materialEvents[i]
			if(_.isEqual(event.category, category)){
				if(event.finishTime > 0){
					return Promise.reject(new Error("同类型的材料正在制造"))
				}else{
					return Promise.reject(new Error("同类型的材料制作完成后还未领取"))
				}
			}else{
				if(!finishNow && event.finishTime > 0){
					return Promise.reject(new Error("不同类型的材料正在制造"))
				}
			}
		}

		var gemUsed = 0
		var makeRequired = DataUtils.getMakeMaterialRequired(category, toolShop.level)
		var buyedResources = null
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(makeRequired.buildTime)
			buyedResources = DataUtils.buyResources(makeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}else{
			buyedResources = DataUtils.buyResources(makeRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}

		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(makeRequired.resources, doc.resources)
		//产生制造事件
		event = DataUtils.generateMaterialEvent(toolShop, category, finishNow)
		doc.materialEvents.push(event)
		//是否立即完成
		if(finishNow){
			self.pushService.onMakeMaterialFinished(doc, event)
		}else{
			self.callbackService.addPlayerCallback(doc._id, event.finishTime, ExcutePlayerCallback.bind(self))
		}
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 领取材料
 * @param playerId
 * @param category
 * @param callback
 */
pro.getMaterials = function(playerId, category, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.contains(Consts.MaterialType, category)){
		callback(new Error("category 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var event = LogicUtils.getMaterialEventByCategory(doc, category)
		if(!_.isObject(event)){
			return Promise.reject(new Error("没有材料建造事件存在"))
		}
		if(event.finishTime > 0){
			return Promise.reject(new Error("同类型的材料正在制造"))
		}
		//移除制造事件
		LogicUtils.removeEvents([event], doc.materialEvents)
		self.pushService.onGetMaterialSuccess(doc, event)
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//将材料添加到材料仓库,超过仓库上限的直接丢弃
		DataUtils.addPlayerMaterials(doc, event.materials)
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 招募普通士兵
 * @param playerId
 * @param soldierName
 * @param count
 * @param finishNow
 * @param callback
 */
pro.recruitNormalSoldier = function(playerId, soldierName, count, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!DataUtils.hasNormalSoldier(soldierName)){
		callback(new Error("soldierName 普通兵种不存在"))
		return
	}
	if(!_.isNumber(count) || count % 1 !== 0 || count < 1){
		callback(new Error("count 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var barracks = doc.buildings["location_8"]
		if(barracks.level < 1){
			return Promise.reject(new Error("兵营还未建造"))
		}
		if(!finishNow && doc.soldierEvents.length > 0){
			return Promise.reject(new Error("已有士兵正在被招募"))
		}
		if(count > DataUtils.getSoldierMaxRecruitCount(doc, soldierName)){
			return Promise.reject(new Error("招募数量超过单次招募上限"))
		}

		var gemUsed = 0
		var recruitRequired = DataUtils.getRecruitNormalSoldierRequired(soldierName, count)
		var buyedResources = null

		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(recruitRequired.recruitTime)
			buyedResources = DataUtils.buyResources(recruitRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}else{
			buyedResources = DataUtils.buyResources(recruitRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}

		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(recruitRequired.resources, doc.resources)
		//是否立即完成
		if(finishNow){
			doc.soldiers[soldierName] += count
			//刷新玩家战力
			self.refreshPlayerPower(doc)
			self.pushService.onRecruitSoldierSuccess(doc, soldierName, count)
		}else{
			var finishTime = Date.now() + (recruitRequired.recruitTime * 1000)
			LogicUtils.addSoldierEvent(doc, soldierName, count, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//刷新玩家资源数据
		self.refreshPlayerResources(doc)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 招募特殊士兵
 * @param playerId
 * @param soldierName
 * @param count
 * @param finishNow
 * @param callback
 */
pro.recruitSpecialSoldier = function(playerId, soldierName, count, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!DataUtils.hasSpecialSoldier(soldierName)){
		callback(new Error("soldierName 特殊兵种不存在"))
		return
	}
	if(!_.isNumber(count) || count % 1 !== 0 || count < 1){
		callback(new Error("count 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var barracks = doc.buildings["location_8"]
		if(barracks.level < 1){
			return Promise.reject(new Error("兵营还未建造"))
		}
		if(!finishNow && doc.soldierEvents.length > 0){
			return Promise.reject(new Error("已有士兵正在被招募"))
		}
		if(count > DataUtils.getSoldierMaxRecruitCount(doc, soldierName)){
			return Promise.reject(new Error("招募数量超过单次招募上限"))
		}

		var gemUsed = 0
		var recruitRequired = DataUtils.getRecruitSpecialSoldierRequired(soldierName, count)
		if(!LogicUtils.isEnough(recruitRequired.materials, doc.soldierMaterials)){
			return Promise.reject(new Error("材料不足"))
		}
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(recruitRequired.recruitTime)
		}
		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(recruitRequired.materials, doc.soldierMaterials)
		if(finishNow){
			doc.soldiers[soldierName] += count
			//刷新玩家战力
			self.refreshPlayerPower(doc)
			self.pushService.onRecruitSoldierSuccess(doc, soldierName, count)
		}else{
			var finishTime = Date.now() + (recruitRequired.recruitTime * 1000)
			LogicUtils.addSoldierEvent(doc, soldierName, count, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 制作龙的装备
 * @param playerId
 * @param equipmentName
 * @param finishNow
 * @param callback
 */
pro.makeDragonEquipment = function(playerId, equipmentName, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!DataUtils.isDragonEquipment(equipmentName)){
		callback(new Error("equipmentName 装备不存在"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var toolShop = doc.buildings["location_9"]
		if(toolShop.level < 1){
			return Promise.reject(new Error("铁匠铺还未建造"))
		}
		if(!finishNow && doc.dragonEquipmentEvents.length > 0){
			return Promise.reject(new Error("已有装备正在制作"))
		}
		var gemUsed = 0
		var makeRequired = DataUtils.getMakeDragonEquipmentRequired(doc, equipmentName)
		var buyedResources = null
		//材料是否足够
		if(!LogicUtils.isEnough(makeRequired.materials, doc.dragonMaterials)){
			return Promise.reject(new Error("材料不足"))
		}
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(makeRequired.makeTime)
			buyedResources = DataUtils.buyResources({coin:makeRequired.coin}, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}else{
			buyedResources = DataUtils.buyResources({coin:makeRequired.coin}, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}
		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce({coin:makeRequired.coin}, doc.resources)
		//修改玩家制作龙的材料数据
		LogicUtils.reduce(makeRequired.materials, doc.dragonMaterials)
		//是否立即完成
		if(finishNow){
			doc.dragonEquipmentEvents[equipmentName] += 1
			self.pushService.onMakeDragonEquipmentSuccess(doc, equipmentName)
		}else{
			var finishTime = Date.now() + (makeRequired.makeTime * 1000)
			LogicUtils.addDragonEquipmentEvent(doc, equipmentName, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 治疗伤兵
 * @param playerId
 * @param soldiers
 * @param finishNow
 * @param callback
 */
pro.treatSoldier = function(playerId, soldiers, finishNow, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isArray(soldiers)){
		callback(new Error("soldiers 不合法"))
		return
	}
	if(!_.isBoolean(finishNow)){
		callback(new Error("finishNow 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var hospital = doc.buildings["location_14"]
		if(hospital.level < 1){
			return Promise.reject(new Error("医院还未建造"))
		}
		if(!LogicUtils.isTreatSoldierLegal(doc, soldiers)){
			return Promise.reject(new Error("士兵不存在或士兵数量不合法"))
		}
		if(!finishNow && doc.treatSoldierEvents.length > 0){
			return Promise.reject(new Error("已有士兵正在治疗"))
		}

		var gemUsed = 0
		var treatRequired = DataUtils.getTreatSoldierRequired(doc, soldiers)
		var buyedResources = null
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(treatRequired.treatTime)
			buyedResources = DataUtils.buyResources(treatRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}else{
			buyedResources = DataUtils.buyResources(treatRequired.resources, doc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, doc.resources)
		}
		//宝石是否足够
		if(gemUsed > doc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		//修改玩家宝石数据
		doc.resources.gem -= gemUsed
		//修改玩家资源数据
		LogicUtils.reduce(treatRequired.resources, doc.resources)
		//是否立即完成
		if(finishNow){
			_.each(soldiers, function(soldier){
				doc.soldiers[soldier.name] += soldier.count
				doc.treatSoldiers[soldier.name] -= soldier.count
			})
			self.pushService.onTreatSoldierSuccess(doc, soldiers)
		}else{
			var finishTime = Date.now() + (treatRequired.treatTime * 1000)
			LogicUtils.addTreatSoldierEvent(doc, soldiers, finishTime)
			self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))
		}
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 孵化龙蛋
 * @param playerId
 * @param dragonType
 * @param callback
 */
pro.hatchDragon = function(playerId, dragonType, callback){
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

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var hospital = doc.buildings["location_4"]
		if(hospital.level < 1){
			return Promise.reject(new Error("龙巢还未建造"))
		}
		self.refreshPlayerResources(doc)
		if(doc.resources.energy < 10){
			return Promise.reject(new Error("能量不足"))
		}
		var dragon = doc.dragons[dragonType]
		if(dragon.star > 0){
			return Promise.reject(new Error("龙蛋早已成功孵化"))
		}
		dragon.vitality += 10
		doc.resources.energy -= 10
		if(dragon.vitality >= 100){
			dragon.star = 1
			dragon.vitality = DataUtils.getDragonMaxVitality(doc, dragon)
			dragon.strength = DataUtils.getDragonStrength(doc, dragon)
		}
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 设置龙的某部位的装备
 * @param playerId
 * @param dragonType
 * @param equipmentCategory
 * @param equipmentName
 * @param callback
 */
pro.setDragonEquipment = function(playerId, dragonType, equipmentCategory, equipmentName, callback){
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
	if(!_.contains(Consts.DragonEquipmentCategory, equipmentCategory)){
		callback(new Error("equipmentCategory 不合法"))
		return
	}
	if(!DataUtils.isDragonEquipment(equipmentName)){
		callback(new Error("equipmentName 不合法"))
		return
	}
	if(!DataUtils.isDragonEquipmentLegalAtCategory(equipmentName, equipmentCategory)){
		callback(new Error("equipmentName 不能装备到equipmentCategory"))
		return
	}
	if(!DataUtils.isDragonEquipmentLegalOnDragon(equipmentName, dragonType)){
		callback(new Error("equipmentName 不能装备到dragonType"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var dragon = doc.dragons[dragonType]
		if(dragon.star <= 0){
			return Promise.reject(new Error("龙还未孵化"))
		}
		if(!DataUtils.isDragonEquipmentStarEqualWithDragonStar(equipmentName, dragon)){
			return Promise.reject(new Error("装备与龙的星级不匹配"))
		}
		if(doc.dragonEquipments[equipmentName] <= 0){
			return Promise.reject(new Error("仓库中没有此装备"))
		}
		var equipment = dragon.equipments[equipmentCategory]
		if(!_.isEmpty(equipment.name)){
			return Promise.reject(new Error("龙身上已经存在相同类型的装备"))
		}
		equipment.name = equipmentName
		equipment.buffs = DataUtils.generateDragonEquipmentBuffs(equipmentName)
		doc.dragonEquipments[equipmentName] -= 1
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 强化龙的装备
 * @param playerId
 * @param dragonType
 * @param equipmentCategory
 * @param equipments
 * @param callback
 */
pro.enhanceDragonEquipment = function(playerId, dragonType, equipmentCategory, equipments, callback){
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
	if(!_.contains(Consts.DragonEquipmentCategory, equipmentCategory)){
		callback(new Error("equipmentCategory 不合法"))
		return
	}
	if(!_.isArray(equipments)){
		callback(new Error("equipments 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var dragon = doc.dragons[dragonType]
		var equipment = dragon.equipments[equipmentCategory]
		if(_.isEmpty(equipment.name)){
			return Promise.reject(new Error("此分类还没有配置装备"))
		}
		if(DataUtils.isDragonEquipmentReachMaxStar(equipment)){
			return Promise.reject(new Error("装备已到最高星级"))
		}
		if(!LogicUtils.isEnhanceDragonEquipmentLegal(doc, equipments)){
			return Promise.reject(new Error("被强化的装备不存在或数量不足"))
		}
		DataUtils.enhanceDragonEquipment(doc, dragonType, equipmentCategory, equipments)
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 重置装备随机属性
 * @param playerId
 * @param dragonType
 * @param equipmentCategory
 * @param callback
 */
pro.resetDragonEquipment = function(playerId, dragonType, equipmentCategory, callback){
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
	if(!_.contains(Consts.DragonEquipmentCategory, equipmentCategory)){
		callback(new Error("equipmentCategory 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var dragon = doc.dragons[dragonType]
		var equipment = dragon.equipments[equipmentCategory]
		if(_.isEmpty(equipment.name)){
			return Promise.reject(new Error("此分类还没有配置装备"))
		}
		if(doc.dragonEquipments[equipment.name] <= 0){
			return Promise.reject(new Error("仓库中没有此装备"))
		}
		equipment.buffs = DataUtils.generateDragonEquipmentBuffs(equipment.name)
		doc.dragonEquipments[equipment.name] -= 1
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 升级龙的技能
 * @param playerId
 * @param dragonType
 * @param skillLocation
 * @param callback
 */
pro.upgradeDragonSkill = function(playerId, dragonType, skillLocation, callback){
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
	if(!_.isNumber(skillLocation) || skillLocation % 1 !== 0 || skillLocation < 1 || skillLocation > 9){
		callback(new Error("skillLocation 不合法"))
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var dragon = doc.dragons[dragonType]
		if(dragon.star <= 0){
			return Promise.reject(new Error("龙还未孵化"))
		}
		var skill = dragon.skills["skill_" + skillLocation]
		if(!DataUtils.isDragonSkillUnlocked(dragon, skill.name)){
			return Promise.reject(new Error("此技能还未解锁"))
		}
		if(DataUtils.isDragonSkillReachMaxLevel(skill)){
			return Promise.reject(new Error("技能已达最高等级"))
		}

		var upgradeRequired = DataUtils.getDragonSkillUpgradeRequired(doc, dragon, skill)
		self.refreshPlayerResources(doc)
		if(doc.resources.energy < upgradeRequired.energy){
			return Promise.reject(new Error("能量不足"))
		}
		if(doc.resources.blood < upgradeRequired.blood){
			return Promise.reject(new Error("英雄之血不足"))
		}
		skill.level += 1
		doc.resources.energy -= upgradeRequired.energy
		doc.resources.blood -= upgradeRequired.blood
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 升级龙的星级
 * @param playerId
 * @param dragonType
 * @param callback
 */
pro.upgradeDragonStar = function(playerId, dragonType, callback){
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

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var dragon = doc.dragons[dragonType]
		if(dragon.star <= 0){
			return Promise.reject(new Error("龙还未孵化"))
		}
		if(DataUtils.isDragonReachMaxStar(dragon)){
			return Promise.reject(new Error("龙的星级已达最高"))
		}
		if(!DataUtils.isDragonReachUpgradeLevel(dragon)){
			return Promise.reject(new Error("龙的等级未达到晋级要求"))
		}
		if(!DataUtils.isDragonEquipmentsReachUpgradeLevel(dragon)){
			return Promise.reject(new Error("龙的装备未达到晋级要求"))
		}
		//晋级
		dragon.star += 1
		dragon.vitality = DataUtils.getDragonMaxVitality(doc, dragon)
		dragon.strength = DataUtils.getDragonStrength(doc, dragon)
		//清除装备
		_.each(dragon.equipments, function(equipment){
			equipment.name = ""
			equipment.star = 0
			equipment.exp = 0
			equipment.buffs = []
		})
		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 向城民收取银币
 * @param playerId
 * @param callback
 */
pro.impose = function(playerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		var building = doc.buildings["location_15"]
		if(building.level <= 0){
			return Promise.reject(new Error("市政厅还未建造"))
		}
		if(doc.coinEvents.length > 0){
			return Promise.reject(new Error("正在收税中"))
		}

		self.refreshPlayerResources(doc)
		var required = DataUtils.getImposeRequired(doc)
		var imposedCoin = DataUtils.getImposedCoin(doc)
		if(required.citizen > doc.resources.citizen){
			return Promise.reject(new Error("空闲城民不足"))
		}
		doc.resources.citizen -= required.citizen
		var finishTime = Date.now() + (required.imposeTime * 1000)
		LogicUtils.addCoinEvent(doc, imposedCoin, finishTime)
		self.callbackService.addPlayerCallback(doc._id, finishTime, ExcutePlayerCallback.bind(self))

		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 创建联盟
 * @param playerId
 * @param name
 * @param tag
 * @param language
 * @param terrain
 * @param flag
 * @param callback
 */
pro.createAlliance = function(playerId, name, tag, language, terrain, flag, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(name)){
		callback(new Error("name 不合法"))
		return
	}
	if(!_.isString(tag)){
		callback(new Error("tag 不合法"))
		return
	}
	if(!_.contains(Consts.AllianceLanguage, language)){
		callback(new Error("language 不合法"))
		return
	}
	if(!_.contains(Consts.AllianceTerrain, terrain)){
		callback(new Error("terrain 不合法"))
		return
	}
	if(!_.isString(flag)){
		callback(new Error("flag 不合法"))
		return
	}

	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		if(!_.isEmpty(doc.alliance.id)){
			return Promise.reject(new Error("玩家已加入了联盟"))
		}
		self.allianceDao.findAsync({"basicInfo.name":name}).then(function(doc){

		}).catch(function(e){
			return Promise.reject(e)
		})

		//保存玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家数据到客户端
		self.pushService.onPlayerDataChanged(doc)
		callback()
	}).catch(function(e){
		callback(e)
	})
}

var ExcutePlayerCallback = function(playerId, finishTime){
	var self = this
	this.cacheService.getPlayerAsync(playerId).then(function(doc){
		//更新资源数据
		self.refreshPlayerResources(doc)
		//检查建筑
		var buildingFinishedEvents = []
		_.each(doc.buildingEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				buildingFinishedEvents.push(event)
				var building = LogicUtils.getBuildingByEvent(doc, event)
				building.level += 1
				//检查是否有建筑需要从-1级升级到0级
				LogicUtils.updateBuildingsLevel(doc)
				self.pushService.onBuildingLevelUp(doc, event.location)
			}
		})
		LogicUtils.removeEvents(buildingFinishedEvents, doc.buildingEvents)
		//检查小屋
		var houseFinishedEvents = []
		_.each(doc.houseEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				houseFinishedEvents.push(event)
				var house = LogicUtils.getHouseByEvent(doc, event)
				house.level += 1
				self.pushService.onHouseLevelUp(doc, event.buildingLocation, event.houseLocation)
				//如果是住宅,送玩家城民
				if(_.isEqual("dwelling", house.type)){
					var previous = DataUtils.getDwellingPopulationByLevel(house.level - 1)
					var next = DataUtils.getDwellingPopulationByLevel(house.level)
					doc.resources.citizen += next - previous
					self.refreshPlayerResources(doc)
				}
			}
		})
		LogicUtils.removeEvents(houseFinishedEvents, doc.houseEvents)
		//检查箭塔
		var towerFinishedEvents = []
		_.each(doc.towerEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				var tower = LogicUtils.getTowerByEvent(doc, event)
				tower.level += 1
				self.pushService.onTowerLevelUp(doc, event.location)
				towerFinishedEvents.push(event)
			}
		})
		LogicUtils.removeEvents(towerFinishedEvents, doc.towerEvents)
		//检查城墙
		var wallFinishedEvents = []
		_.each(doc.wallEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				var wall = doc.wall
				wall.level += 1
				self.pushService.onWallLevelUp(doc)
				wallFinishedEvents.push(event)
			}
		})
		LogicUtils.removeEvents(wallFinishedEvents, doc.wallEvents)
		//检查材料制造
		_.each(doc.materialEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				event.finishTime = 0
				self.pushService.onMakeMaterialFinished(doc, event)
			}
		})
		//检查招募事件
		var soldierFinishedEvents = []
		_.each(doc.soldierEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				doc.soldiers[event.name] += event.count
				self.pushService.onRecruitSoldierSuccess(doc, event.name, event.count)
				soldierFinishedEvents.push(event)
			}
		})
		LogicUtils.removeEvents(soldierFinishedEvents, doc.soldierEvents)
		//检查龙装备制作事件
		var dragonEquipmentFinishedEvents = []
		_.each(doc.dragonEquipmentEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				doc.dragonEquipments[event.name] += 1
				self.pushService.onMakeDragonEquipmentSuccess(doc, event.name)
				dragonEquipmentFinishedEvents.push(event)
			}
		})
		LogicUtils.removeEvents(dragonEquipmentFinishedEvents, doc.dragonEquipmentEvents)
		//检查医院治疗伤兵事件
		var treatSoldierFinishedEvents = []
		_.each(doc.treatSoldierEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				_.each(event.soldiers, function(soldier){
					doc.soldiers[soldier.name] += soldier.count
					doc.treatSoldiers[soldier.name] -= soldier.count
				})
				self.pushService.onTreatSoldierSuccess(doc, event.soldiers)
				treatSoldierFinishedEvents.push(event)
			}
		})
		LogicUtils.removeEvents(treatSoldierFinishedEvents, doc.treatSoldierEvents)
		//检查城民税收事件
		var coinFinishedEvents = []
		_.each(doc.coinEvents, function(event){
			if(event.finishTime > 0 && event.finishTime <= finishTime){
				doc.resources.coin += event.coin
				self.pushService.onImposeSuccess(doc, event.coin)
				coinFinishedEvents.push(event)
			}
		})
		LogicUtils.removeEvents(coinFinishedEvents, doc.coinEvents)

		//刷新玩家战力
		self.refreshPlayerPower(doc)
		//更新玩家数据
		return self.cacheService.updatePlayerAsync(doc)
	}).then(function(doc){
		//推送玩家信息到客户端
		self.pushService.onPlayerDataChanged(doc)
	}).catch(function(e){
		errorLogger.error("handle excutePlayerCallback Error -----------------------------")
		errorLogger.error(e.stack)
		if(_.isEqual("production", self.app.get("env"))){
			errorMailLogger.error("handle excutePlayerCallback Error -----------------------------")
			errorMailLogger.error(e.stack)
		}
	})
}