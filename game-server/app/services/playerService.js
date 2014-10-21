"use strict"

/**
 * Created by modun on 14-7-23.
 */
var ShortId = require("shortid")
var Promise = require("bluebird")
var _ = require("underscore")
var crypto = require("crypto")

var AllianceDao = require("../dao/allianceDao")
var PlayerDao = require("../dao/playerDao")

var Utils = require("../utils/utils")
var DataUtils = require("../utils/dataUtils")
var LogicUtils = require("../utils/logicUtils")
var Events = require("../consts/events")
var Consts = require("../consts/consts")
var Define = require("../consts/define")
var Localizations = require("../consts/localizations")

var PlayerService = function(app){
	this.app = app
	this.env = app.get("env")
	this.redis = app.get("redis")
	this.scripto = app.get("scripto")
	this.pushService = this.app.get("pushService")
	this.globalChannelService = this.app.get("globalChannelService")
	this.allianceDao = Promise.promisifyAll(new AllianceDao(this.redis, this.scripto, this.env))
	this.playerDao = Promise.promisifyAll(new PlayerDao(this.redis, this.scripto, this.env))
}

module.exports = PlayerService
var pro = PlayerService.prototype

/**
 * 清空redis中的数据
 */
pro.flushAll = function(callback){
	this.redis.flushallAsync().then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 加载所有玩家到redis
 * @param callback
 */
pro.loadAllPlayer = function(callback){
	this.playerDao.loadAllAsync().then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 将所有玩家保存到Mongo
 * @param callback
 */
pro.unloadAllPlayer = function(callback){
	this.playerDao.unloadAllAsync().then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 加载所有联盟到redis
 * @param callback
 */
pro.loadAllAlliance = function(callback){
	this.allianceDao.loadAllAsync().then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 将所有联盟保存到Mongo
 * @param callback
 */
pro.unloadAllAlliance = function(callback){
	this.allianceDao.unloadAllAsync().then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 加载所有数据到内存
 * @param callback
 */
pro.loadAllData = function(callback){
	var self = this
	this.flushAllAsync().then(function(){
		return self.loadAllPlayerAsync()
	}).then(function(){
		return self.loadAllAllianceAsync()
	}).then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 将所有数据保存到Mongo
 * @param callback
 */
pro.unloadAllData = function(callback){
	var self = this
	this.unloadAllPlayerAsync().then(function(){
		return self.unloadAllAllianceAsync()
	}).then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 创建新玩家
 * @param deviceId
 * @param callback
 */
pro.createPlayer = function(deviceId, callback){
	var self = this
	Promise.promisify(crypto.randomBytes)(4).then(function(buf){
		var token = buf.toString("hex")
		var doc = {
			countInfo:{
				deviceId:deviceId
			},
			basicInfo:{
				name:"player_" + token,
				cityName:"city_" + token
			}
		}
		return self.playerDao.createAsync(doc)
	}).then(function(doc){
		callback(null, doc)
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 玩家登陆逻辑服务器
 * @param playerDoc
 * @param callback
 */
pro.playerLogin = function(playerDoc, callback){
	var self = this
	var allianceDoc = null
	var pushFuncs = null
	var eventFuncs = null

	playerDoc.countInfo.lastLoginTime = Date.now()
	playerDoc.countInfo.loginCount += 1
	if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
		var params = AfterPlayerLogin.call(self, playerDoc, null)
		pushFuncs = params.pushFuncs
		eventFuncs = params.eventFuncs
		pushFuncs.unshift([self.pushService, self.pushService.onPlayerLoginSuccessAsync, playerDoc])
		LogicUtils.excuteAll(eventFuncs).then(function(){
			return LogicUtils.excuteAll(pushFuncs)
		}).then(function(){
			callback()
		}).catch(function(e){
			callback(e)
		})
		return
	}

	this.allianceDao.findByIdAsync(playerDoc.alliance.id).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		var memberDoc = LogicUtils.updateMyPropertyInAlliance(playerDoc, allianceDoc)
		LogicUtils.refreshAlliance(allianceDoc)
		var params = AfterPlayerLogin.call(self, playerDoc, allianceDoc)
		pushFuncs = params.pushFuncs
		eventFuncs = params.eventFuncs
		return self.allianceDao.updateAsync(allianceDoc).then(function(){
			pushFuncs.unshift([self.pushService, self.pushService.onAllianceBasicInfoAndMemberDataChangedAsync, allianceDoc, memberDoc])
			pushFuncs.unshift([self.pushService, self.pushService.onPlayerLoginSuccessAsync, playerDoc])
			return LogicUtils.excuteAll(eventFuncs)
		})
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		if(_.isObject(allianceDoc)){
			self.allianceDao.removeLockByIdAsync(allianceDoc._id).then(function(){
				callback(e)
			})
		}else{
			callback(e)
		}
	})
}

/**
 * 玩家登出逻辑服
 * @param playerDoc
 * @param callback
 */
pro.playerLogout = function(playerDoc, callback){
	ClearPlayerTimeEvents.call(this, playerDoc).then(function(){
		callback()
	}).catch(function(e){
		callback(e)
	})
}

/**
 * 到达指定时间时,触发的消息
 * @param key
 * @param finishTime
 * @param callback
 */
pro.onTimeEvent = function(key, finishTime, callback){
	var params = key.split("_")
	var eventType = params[0]
	var id = params[1]
	if(_.isEqual(Consts.TimeEventType.Player, eventType)){
		ExcutePlayerCallback.call(this, id, finishTime).then(function(){
			callback()
		}).catch(function(e){
			callback(e)
		})
	}
}

pro.joinAllianceDirectly = function(playerId, allianceId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(allianceId)){
		callback(new Error("allianceId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var inviterDocs = []
	var requestedAllianceDocs = []
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(_.isObject(playerDoc.alliance) && !_.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家已加入联盟"))
		}
		return self.allianceDao.findByIdAsync(allianceId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		if(!_.isEqual(doc.basicInfo.joinType, Consts.AllianceJoinType.All)){
			return Promise.reject(new Error("联盟不允许直接加入"))
		}

		LogicUtils.addAllianceMember(allianceDoc, playerDoc, Consts.AllianceTitle.Member)
		LogicUtils.refreshAlliance(allianceDoc)
		updateFuncs.push([self.globalChannelService, self.globalChannelService.addAsync, Consts.AllianceChannelPrefix + allianceDoc._id, playerDoc._id, playerDoc.logicServerId])

		playerDoc.alliance = {
			id:allianceDoc._id,
			name:allianceDoc.basicInfo.name,
			tag:allianceDoc.basicInfo.tag,
			title:Consts.AllianceTitle.Member,
			titleName:allianceDoc.titles.member
		}
		var playerData = {}
		playerData.alliance = playerDoc.alliance
		var allianceData = {}
		allianceData.basicInfo = allianceDoc.basicInfo
		allianceData.members = allianceDoc.members
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onGetAllianceDataSuccessAsync, playerDoc, allianceDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])

		var funcs = []
		var removeRequestEvent = function(event){
			return self.allianceDao.findByIdAsync(event.id).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("联盟不存在"))
				}
				requestedAllianceDocs.push(doc)
				var joinRequestEvent = LogicUtils.getPlayerRequestEventAtAlliance(doc, playerId)
				if(!_.isObject(joinRequestEvent)){
					return Promise.reject(new Error("玩家请求事件不存在"))
				}
				LogicUtils.removeItemInArray(doc.joinRequestEvents, joinRequestEvent)
				updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, doc])
				var docData = {}
				docData.joinRequestEvents = doc.joinRequestEvents
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, doc, docData])
				return Promise.resolve()
			})
		}
		_.each(playerDoc.requestToAllianceEvents, function(event){
			funcs.push(removeRequestEvent(event))
		})
		LogicUtils.clearArray(playerDoc.requestToAllianceEvents)

		var sendMailToInviter = function(inviterId){
			var titleKey = Localizations.Alliance.InviteRejectedTitle
			var contentKey = Localizations.Alliance.InviteRejectedContent
			return self.playerDao.findByIdAsync(inviterId).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("玩家不存在"))
				}
				inviterDocs.push(doc)
				var mail = LogicUtils.sendSystemMail(doc, titleKey, [], contentKey, [playerDoc.basicInfo.name])
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, doc, mail])
			})
		}
		_.each(playerDoc.inviteToAllianceEvents, function(event){
			funcs.push(sendMailToInviter(event.inviterId))
		})
		LogicUtils.clearArray(playerDoc.inviteToAllianceEvents)

		return Promise.all(funcs)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		_.each(requestedAllianceDocs, function(doc){
			funcs.push(self.allianceDao.removeLockByIdAsync(doc))
		})
		_.each(inviterDocs, function(doc){
			funcs.push(self.playerDao.removeLockByIdAsync(doc))
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
 * 主动获取玩家联盟的信息
 * @param playerId
 * @param callback
 */
pro.getMyAllianceData = function(playerId, callback){
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
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) && _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, allianceDoc._id])
		pushFuncs.push([self.pushService, self.pushService.onGetAllianceDataSuccessAsync, playerDoc, allianceDoc])
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
	var playerDoc = null
	var pushFuncs = []
	var eventFuncs = []
	var updateFuncs = []

	var building = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		building = playerDoc.buildings["location_" + buildingLocation]
		if(!_.isObject(building)){
			return Promise.reject(new Error("建筑不存在"))
		}
		if(LogicUtils.hasBuildingEvents(playerDoc, buildingLocation)){
			return Promise.reject(new Error("建筑正在升级"))
		}
		if(building.level < 0){
			return Promise.reject(new Error("建筑还未建造"))
		}
		if(building.level == 0 && !LogicUtils.isBuildingCanCreateAtLocation(playerDoc, buildingLocation)){
			return Promise.reject(new Error("建筑建造时,建筑坑位不合法"))
		}
		if(building.level == 0 && DataUtils.getPlayerFreeBuildingsCount(playerDoc) <= 0){
			return Promise.reject(new Error("建造数量已达建造上限"))
		}
		if(!_.isEqual(building.type, "keep") && building.level > 0 && building.level + 1 > DataUtils.getBuildingLevelLimit(playerDoc)){
			return Promise.reject(new Error("建筑升级时,建筑等级不合法"))
		}
		if(building.level > 0 && DataUtils.isBuildingReachMaxLevel(building.type, building.level)){
			return Promise.reject(new Error("建筑已达到最高等级"))
		}
		return Promise.resolve()
	}).then(function(){
		var gemUsed = 0
		var upgradeRequired = DataUtils.getBuildingUpgradeRequired(building.type, building.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		var preBuildEvent = null
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, playerDoc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
			if(!DataUtils.hasFreeBuildQueue(playerDoc)){
				preBuildEvent = LogicUtils.getSmallestBuildEvent(playerDoc)
				var timeRemain = (preBuildEvent.finishTime - Date.now()) / 1000
				gemUsed += DataUtils.getGemByTimeInterval(timeRemain)
			}
		}

		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(upgradeRequired.resources, playerDoc.resources)
		LogicUtils.reduce(upgradeRequired.materials, playerDoc.materials)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])

		if(finishNow){
			building.level = building.level + 1
			LogicUtils.updateBuildingsLevel(playerDoc)
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onBuildingLevelUpAsync, playerDoc, building.location])
		}else{
			if(_.isObject(preBuildEvent)){
				eventFuncs.push([self, RemovePlayerTimeEvent, playerDoc, preBuildEvent.finishTime])
				preBuildEvent.finishTime = Date.now()
				pushFuncs.concat(RefreshPlayerEvents.call(self, playerDoc, allianceDoc, preBuildEvent.finishTime))
			}
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addBuildingEvent(playerDoc, building.location, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		LogicUtils.refreshBuildingEventsData(playerDoc, playerData)
		LogicUtils.refreshPlayerResources(playerDoc)
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	var building = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		building = playerDoc.buildings["location_" + buildingLocation]
		if(!_.isObject(building)){
			return Promise.reject(new Error("主体建筑不存在"))
		}
		if(building.level <= 0){
			return Promise.reject(new Error("主体建筑必须大于等于1级"))
		}
		if(!DataUtils.isHouseTypeExist(houseType)){
			return Promise.reject(new Error("小屋类型不存在"))
		}
		if(DataUtils.getPlayerFreeHousesCount(playerDoc, houseType) <= 0){
			return Promise.reject(new Error("小屋数量超过限制"))
		}
		if(!DataUtils.isBuildingHasHouse(buildingLocation)){
			return Promise.reject(new Error("建筑周围不允许建造小屋"))
		}
		if(!LogicUtils.isHouseCanCreateAtLocation(playerDoc, buildingLocation, houseType, houseLocation)){
			return Promise.reject(new Error("创建小屋时,小屋坑位不合法"))
		}
		if(!_.isEqual("dwelling", houseType)){
			var willUse = DataUtils.getPlayerHouseUsedCitizen(houseType, 1)
			if(DataUtils.getPlayerCitizen(playerDoc) - willUse < 0){
				return Promise.reject(new Error("建造小屋会造成可用城民小于0"))
			}
		}
		return Promise.resolve()
	}).then(function(){
		var gemUsed = 0
		var upgradeRequired = DataUtils.getHouseUpgradeRequired(houseType, 1)
		var buyedResources = null
		var buyedMaterials = null
		var preBuildEvent = null
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, playerDoc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
			if(!DataUtils.hasFreeBuildQueue(playerDoc)){
				preBuildEvent = LogicUtils.getSmallestBuildEvent(playerDoc)
				var timeRemain = (preBuildEvent.finishTime - Date.now()) / 1000
				gemUsed += DataUtils.getGemByTimeInterval(timeRemain)
			}
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(upgradeRequired.resources, playerDoc.resources)
		LogicUtils.reduce(upgradeRequired.materials, playerDoc.materials)
		var house = {
			type:houseType,
			level:0,
			location:houseLocation
		}
		building.houses.push(house)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])

		if(finishNow){
			house.level += 1
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onHouseLevelUpAsync, playerDoc, building.location, house.location])
		}else{
			if(_.isObject(preBuildEvent)){
				eventFuncs.push([self, RemovePlayerTimeEvent, playerDoc, preBuildEvent.finishTime])
				preBuildEvent.finishTime = Date.now()
				pushFuncs.concat(RefreshPlayerEvents.call(self, playerDoc, allianceDoc, preBuildEvent.finishTime))
			}
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addHouseEvent(playerDoc, buildingLocation, houseLocation, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		if(_.isEqual("dwelling", house.type) && finishNow){
			var previous = DataUtils.getDwellingPopulationByLevel(house.level - 1)
			var next = DataUtils.getDwellingPopulationByLevel(house.level)
			playerDoc.resources.citizen += next - previous
		}
		LogicUtils.refreshBuildingEventsData(playerDoc, playerData)
		LogicUtils.refreshPlayerResources(playerDoc)
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	var building = null
	var house = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		building = playerDoc.buildings["location_" + buildingLocation]
		if(!_.isObject(building)){
			return Promise.reject(new Error("主体建筑不存在"))
		}
		if(building.level <= 0){
			return Promise.reject(new Error("主体建筑必须大于等于1级"))
		}
		_.each(building.houses, function(value){
			if(value.location == houseLocation){
				house = value
			}
		})
		if(!_.isObject(house)){
			return Promise.reject(new Error("小屋不存在"))
		}
		if(LogicUtils.hasHouseEvents(playerDoc, building.location, house.location)){
			return Promise.reject(new Error("小屋正在升级"))
		}
		if(house.level + 1 > DataUtils.getBuildingLevelLimit(playerDoc)){
			return Promise.reject(new Error("小屋升级时,小屋等级不合法"))
		}
		if(DataUtils.isHouseReachMaxLevel(house.type, house.level)){
			return Promise.reject(new Error("小屋已达到最高等级"))
		}
		if(!_.isEqual("dwelling", house.type)){
			var currentLevelUsed = DataUtils.getPlayerHouseUsedCitizen(house.type, house.level)
			var nextLevelUsed = DataUtils.getPlayerHouseUsedCitizen(house.type, house.level + 1)
			var willUse = nextLevelUsed - currentLevelUsed
			if(DataUtils.getPlayerCitizen(playerDoc) - willUse < 0){
				return Promise.reject(new Error("升级小屋会造成可用城民小于0"))
			}
		}
		return Promise.resolve()
	}).then(function(){
		var gemUsed = 0
		var upgradeRequired = DataUtils.getHouseUpgradeRequired(house.type, house.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		var preBuildEvent = null
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, playerDoc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
			if(!DataUtils.hasFreeBuildQueue(playerDoc)){
				preBuildEvent = LogicUtils.getSmallestBuildEvent(playerDoc)
				var timeRemain = (preBuildEvent.finishTime - Date.now()) / 1000
				gemUsed += DataUtils.getGemByTimeInterval(timeRemain)
			}
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(upgradeRequired.resources, playerDoc.resources)
		LogicUtils.reduce(upgradeRequired.materials, playerDoc.materials)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])

		if(finishNow){
			house.level += 1
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onHouseLevelUpAsync, playerDoc, building.location, house.location])
		}else{
			if(_.isObject(preBuildEvent)){
				eventFuncs.push([self, RemovePlayerTimeEvent, self, playerDoc, preBuildEvent.finishTime])
				preBuildEvent.finishTime = Date.now()
				pushFuncs.concat(RefreshPlayerEvents.call(self, playerDoc, allianceDoc, preBuildEvent.finishTime))
			}
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addHouseEvent(playerDoc, building.location, house.location, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		if(_.isEqual("dwelling", house.type) && finishNow){
			var previous = DataUtils.getDwellingPopulationByLevel(house.level - 1)
			var next = DataUtils.getDwellingPopulationByLevel(house.level)
			playerDoc.resources.citizen += next - previous
		}
		LogicUtils.refreshBuildingEventsData(playerDoc, playerData)
		LogicUtils.refreshPlayerResources(playerDoc)
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
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var building = playerDoc.buildings["location_" + buildingLocation]
		if(!_.isObject(building)){
			return Promise.reject(new Error("主体建筑不存在"))
		}
		var house = null
		_.each(building.houses, function(value){
			if(value.location == houseLocation){
				house = value
			}
		})
		if(!_.isObject(house)){
			return Promise.reject(new Error("小屋不存在"))
		}
		if(LogicUtils.hasHouseEvents(playerDoc, building.location, house.location)){
			return Promise.reject(new Error("小屋正在升级"))
		}
		LogicUtils.refreshPlayerResources(playerDoc)
		var index = building.houses.indexOf(house)
		building.houses.splice(index, 1)
		LogicUtils.refreshPlayerResources(playerDoc)
		if(_.isEqual("dwelling", house.type) && DataUtils.getPlayerCitizen(playerDoc) < 0){
			return Promise.reject(new Error("拆除此建筑后会造成可用城民数量小于0"))
		}
		var gem = 100
		if(gem > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gem
		var returnedResources = DataUtils.getHouseDestroyReturned(house.type, house.level)
		LogicUtils.increace(returnedResources, playerDoc.resources)
		LogicUtils.refreshPlayerResources(playerDoc)
		LogicUtils.refreshPlayerPower(playerDoc)
		return self.playerDao.updateAsync(playerDoc)
	}).then(function(playerDoc){
		var playerData = {}
		LogicUtils.refreshBuildingEventsData(playerDoc, playerData)
		return self.pushService.onPlayerDataChangedAsync(playerDoc, playerData)
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	var tower = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		tower = playerDoc.towers["location_" + towerLocation]
		if(!_.isObject(tower)){
			return Promise.reject(new Error("箭塔不存在"))
		}
		if(LogicUtils.hasTowerEvents(playerDoc, tower.location)){
			return Promise.reject(new Error("箭塔正在升级"))
		}
		if(tower.level < 1){
			return Promise.reject(new Error("箭塔还未建造"))
		}
		if(DataUtils.isBuildingReachMaxLevel("tower", tower.level)){
			return Promise.reject(new Error("箭塔已达到最高等级"))
		}
		if(tower.level + 1 > DataUtils.getBuildingLevelLimit(playerDoc)){
			return Promise.reject(new Error("箭塔升级时,建筑等级不合法"))
		}
		return Promise.resolve()
	}).then(function(){
		var gemUsed = 0
		var upgradeRequired = DataUtils.getBuildingUpgradeRequired("tower", tower.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		var preBuildEvent = null
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, playerDoc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
			if(!DataUtils.hasFreeBuildQueue(playerDoc)){
				preBuildEvent = LogicUtils.getSmallestBuildEvent(playerDoc)
				var timeRemain = (preBuildEvent.finishTime - Date.now()) / 1000
				gemUsed += DataUtils.getGemByTimeInterval(timeRemain)
			}
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(upgradeRequired.resources, playerDoc.resources)
		LogicUtils.reduce(upgradeRequired.materials, playerDoc.materials)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])

		if(finishNow){
			tower.level = tower.level + 1
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onTowerLevelUpAsync, playerDoc, tower.location])
		}else{
			if(_.isObject(preBuildEvent)){
				eventFuncs.push([self, RemovePlayerTimeEvent, playerDoc, preBuildEvent.finishTime])
				preBuildEvent.finishTime = Date.now()
				RefreshPlayerEvents.call(self, playerDoc, allianceDoc, preBuildEvent.finishTime)
			}
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addTowerEvent(playerDoc, tower.location, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		LogicUtils.refreshBuildingEventsData(playerDoc, playerData)
		LogicUtils.refreshPlayerResources(playerDoc)
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []

	var wall = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		wall = playerDoc.wall
		if(!_.isObject(wall)){
			return Promise.reject(new Error("城墙不存在"))
		}
		if(LogicUtils.hasWallEvents(playerDoc)){
			return Promise.reject(new Error("城墙正在升级"))
		}
		if(wall.level < 1){
			return Promise.reject(new Error("城墙还未建造"))
		}
		if(DataUtils.isBuildingReachMaxLevel("wall", wall.level)){
			return Promise.reject(new Error("城墙已达到最高等级"))
		}
		if(wall.level + 1 > DataUtils.getBuildingLevelLimit(playerDoc)){
			return Promise.reject(new Error("城墙升级时,城墙等级不合法"))
		}
		return Promise.resolve()
	}).then(function(){
		var gemUsed = 0
		var upgradeRequired = DataUtils.getBuildingUpgradeRequired("wall", wall.level + 1)
		var buyedResources = null
		var buyedMaterials = null
		var preBuildEvent = null
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(upgradeRequired.buildTime)
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, {})
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
		}else{
			buyedResources = DataUtils.buyResources(upgradeRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
			buyedMaterials = DataUtils.buyMaterials(upgradeRequired.materials, playerDoc.materials)
			gemUsed += buyedMaterials.gemUsed
			LogicUtils.increace(buyedMaterials.totalBuy, playerDoc.materials)
			if(!DataUtils.hasFreeBuildQueue(playerDoc)){
				preBuildEvent = LogicUtils.getSmallestBuildEvent(playerDoc)
				var timeRemain = (preBuildEvent.finishTime - Date.now()) / 1000
				gemUsed += DataUtils.getGemByTimeInterval(timeRemain)
			}
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(upgradeRequired.resources, playerDoc.resources)
		LogicUtils.reduce(upgradeRequired.materials, playerDoc.materials)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])

		if(finishNow){
			wall.level = wall.level + 1
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onWallLevelUpAsync, playerDoc])
		}else{
			if(_.isObject(preBuildEvent)){
				eventFuncs.push([self, RemovePlayerTimeEvent, playerDoc, preBuildEvent.finishTime])
				preBuildEvent.finishTime = Date.now()
				RefreshPlayerEvents.call(self, playerDoc, allianceDoc, preBuildEvent.finishTime)
			}
			var finishTime = Date.now() + (upgradeRequired.buildTime * 1000)
			LogicUtils.addWallEvent(playerDoc, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		LogicUtils.refreshBuildingEventsData(playerDoc, playerData)
		LogicUtils.refreshPlayerResources(playerDoc)
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var toolShop = playerDoc.buildings["location_5"]
		if(toolShop.level < 1){
			return Promise.reject(new Error("工具作坊还未建造"))
		}
		var event = null
		for(var i = 0; i < playerDoc.materialEvents.length; i++){
			event = playerDoc.materialEvents[i]
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
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(makeRequired.buildTime)
			buyedResources = DataUtils.buyResources(makeRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}else{
			buyedResources = DataUtils.buyResources(makeRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(makeRequired.resources, playerDoc.resources)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

		event = DataUtils.generateMaterialEvent(toolShop, category, finishNow)
		playerDoc.materialEvents.push(event)
		if(finishNow){
			pushFuncs.push([self.pushService, self.pushService.onMakeMaterialFinishedAsync, playerDoc, event])
		}else{
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
		LogicUtils.refreshPlayerResources(playerDoc)
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		playerData.materialEvents = playerDoc.materialEvents
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
	var playerDoc = null
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var event = LogicUtils.getMaterialEventByCategory(playerDoc, category)
		if(!_.isObject(event)){
			return Promise.reject(new Error("没有材料建造事件存在"))
		}
		if(event.finishTime > 0){
			return Promise.reject(new Error("同类型的材料正在制造"))
		}
		var playerData = {}
		LogicUtils.removeEvents([event], playerDoc.materialEvents)
		DataUtils.addPlayerMaterials(playerDoc, event.materials)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onGetMaterialSuccessAsync, playerDoc, event])
		playerData.materialEvents = playerDoc.materialEvents
		playerData.materials = playerDoc.materials
		return self.playerDao.updateAsync(playerDoc)
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var barracks = playerDoc.buildings["location_8"]
		if(barracks.level < 1){
			return Promise.reject(new Error("兵营还未建造"))
		}
		if(!finishNow && playerDoc.soldierEvents.length > 0){
			return Promise.reject(new Error("已有士兵正在被招募"))
		}
		if(count > DataUtils.getSoldierMaxRecruitCount(playerDoc, soldierName)){
			return Promise.reject(new Error("招募数量超过单次招募上限"))
		}

		var gemUsed = 0
		var recruitRequired = DataUtils.getRecruitNormalSoldierRequired(soldierName, count)
		var buyedResources = null
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(recruitRequired.recruitTime)
			buyedResources = DataUtils.buyResources(recruitRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}else{
			buyedResources = DataUtils.buyResources(recruitRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(recruitRequired.resources, playerDoc.resources)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

		if(finishNow){
			playerDoc.soldiers[soldierName] += count
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onRecruitSoldierSuccessAsync, playerDoc, soldierName, count])
		}else{
			var finishTime = Date.now() + (recruitRequired.recruitTime * 1000)
			LogicUtils.addSoldierEvent(playerDoc, soldierName, count, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		LogicUtils.refreshPlayerResources(playerDoc)
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		playerData.soldierEvents = playerDoc.soldierEvents
		playerData.soldiers = playerDoc.soldiers
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var barracks = playerDoc.buildings["location_8"]
		if(barracks.level < 1){
			return Promise.reject(new Error("兵营还未建造"))
		}
		if(!finishNow && playerDoc.soldierEvents.length > 0){
			return Promise.reject(new Error("已有士兵正在被招募"))
		}
		if(count > DataUtils.getSoldierMaxRecruitCount(playerDoc, soldierName)){
			return Promise.reject(new Error("招募数量超过单次招募上限"))
		}

		var gemUsed = 0
		var recruitRequired = DataUtils.getRecruitSpecialSoldierRequired(soldierName, count)
		var buyedResources = null
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(!LogicUtils.isEnough(recruitRequired.materials, playerDoc.soldierMaterials)){
			return Promise.reject(new Error("材料不足"))
		}
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(recruitRequired.recruitTime)
			buyedResources = DataUtils.buyResources({citizen:recruitRequired.citizen}, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}else{
			buyedResources = DataUtils.buyResources({citizen:recruitRequired.citizen}, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(recruitRequired.materials, playerDoc.soldierMaterials)
		LogicUtils.reduce({citizen:recruitRequired.citizen}, playerDoc.resources)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

		if(finishNow){
			playerDoc.soldiers[soldierName] += count
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onRecruitSoldierSuccessAsync, playerDoc, soldierName, count])
		}else{
			var finishTime = Date.now() + (recruitRequired.recruitTime * 1000)
			LogicUtils.addSoldierEvent(playerDoc, soldierName, count, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		LogicUtils.refreshPlayerResources(playerDoc)
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		playerData.soldierEvents = playerDoc.soldierEvents
		playerData.soldiers = playerDoc.soldiers
		playerData.soldierMaterials = playerDoc.soldierMaterials
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var toolShop = playerDoc.buildings["location_9"]
		if(toolShop.level < 1){
			return Promise.reject(new Error("铁匠铺还未建造"))
		}
		if(!finishNow && playerDoc.dragonEquipmentEvents.length > 0){
			return Promise.reject(new Error("已有装备正在制作"))
		}
		var gemUsed = 0
		var makeRequired = DataUtils.getMakeDragonEquipmentRequired(playerDoc, equipmentName)
		var buyedResources = null
		var playerData = {}
		if(!LogicUtils.isEnough(makeRequired.materials, playerDoc.dragonMaterials)){
			return Promise.reject(new Error("材料不足"))
		}
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(makeRequired.makeTime)
			buyedResources = DataUtils.buyResources({coin:makeRequired.coin}, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}else{
			buyedResources = DataUtils.buyResources({coin:makeRequired.coin}, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce({coin:makeRequired.coin}, playerDoc.resources)
		LogicUtils.reduce(makeRequired.materials, playerDoc.dragonMaterials)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

		if(finishNow){
			playerDoc.dragonEquipments[equipmentName] += 1
			pushFuncs.push([self.pushService, self.pushService.onMakeDragonEquipmentSuccessAsync, playerDoc, equipmentName])
		}else{
			var finishTime = Date.now() + (makeRequired.makeTime * 1000)
			LogicUtils.addDragonEquipmentEvent(playerDoc, equipmentName, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		playerData.dragonMaterials = playerDoc.dragonMaterials
		playerData.dragonEquipments = playerDoc.dragonEquipments
		playerData.dragonEquipmentEvents = playerDoc.dragonEquipmentEvents
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var hospital = playerDoc.buildings["location_14"]
		if(hospital.level < 1){
			return Promise.reject(new Error("医院还未建造"))
		}
		if(!LogicUtils.isTreatSoldierLegal(playerDoc, soldiers)){
			return Promise.reject(new Error("士兵不存在或士兵数量不合法"))
		}
		if(!finishNow && playerDoc.treatSoldierEvents.length > 0){
			return Promise.reject(new Error("已有士兵正在治疗"))
		}

		var gemUsed = 0
		var treatRequired = DataUtils.getTreatSoldierRequired(playerDoc, soldiers)
		var buyedResources = null
		var playerData = {}
		if(finishNow){
			gemUsed += DataUtils.getGemByTimeInterval(treatRequired.treatTime)
			buyedResources = DataUtils.buyResources(treatRequired.resources, {})
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}else{
			buyedResources = DataUtils.buyResources(treatRequired.resources, playerDoc.resources)
			gemUsed += buyedResources.gemUsed
			LogicUtils.increace(buyedResources.totalBuy, playerDoc.resources)
		}
		if(gemUsed > playerDoc.resources.gem){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		LogicUtils.reduce(treatRequired.resources, playerDoc.resources)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

		if(finishNow){
			_.each(soldiers, function(soldier){
				playerDoc.soldiers[soldier.name] += soldier.count
				playerDoc.treatSoldiers[soldier.name] -= soldier.count
			})
			LogicUtils.refreshPlayerPower(playerDoc)
			pushFuncs.push([self.pushService, self.pushService.onTreatSoldierSuccessAsync, playerDoc, soldiers])
		}else{
			_.each(soldiers, function(soldier){
				playerDoc.treatSoldiers[soldier.name] -= soldier.count
			})
			var finishTime = Date.now() + (treatRequired.treatTime * 1000)
			LogicUtils.addTreatSoldierEvent(playerDoc, soldiers, finishTime)
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		}
		LogicUtils.refreshPlayerResources(playerDoc)
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		playerData.soldiers = playerDoc.soldiers
		playerData.treatSoldiers = playerDoc.treatSoldiers
		playerData.treatSoldierEvents = playerDoc.treatSoldierEvents
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var hospital = playerDoc.buildings["location_4"]
		if(hospital.level < 1){
			return Promise.reject(new Error("龙巢还未建造"))
		}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(playerDoc.resources.energy <= 0){
			return Promise.reject(new Error("能量不足"))
		}
		var dragon = playerDoc.dragons[dragonType]
		if(dragon.star > 0){
			return Promise.reject(new Error("龙蛋早已成功孵化"))
		}
		var playerData = {}
		var energyNeed = 100 - dragon.vitality
		if(playerDoc.resources.energy >= energyNeed){
			dragon.star = 1
			dragon.vitality = DataUtils.getDragonMaxVitality(playerDoc, dragon)
			dragon.strength = DataUtils.getDragonStrength(playerDoc, dragon)
			playerDoc.resources.energy -= energyNeed
		}else{
			dragon.vitality += playerDoc.resources.energy
			playerDoc.resources.energy = 0
		}
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.resources = playerDoc.resources
		playerData.basicInfo = playerDoc.basicInfo
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDoc.dragons[dragonType]
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var dragon = playerDoc.dragons[dragonType]
		if(dragon.star <= 0){
			return Promise.reject(new Error("龙还未孵化"))
		}
		if(!DataUtils.isDragonEquipmentStarEqualWithDragonStar(equipmentName, dragon)){
			return Promise.reject(new Error("装备与龙的星级不匹配"))
		}
		if(playerDoc.dragonEquipments[equipmentName] <= 0){
			return Promise.reject(new Error("仓库中没有此装备"))
		}
		var equipment = dragon.equipments[equipmentCategory]
		if(!_.isEmpty(equipment.name)){
			return Promise.reject(new Error("龙身上已经存在相同类型的装备"))
		}
		var playerData = {}
		equipment.name = equipmentName
		equipment.buffs = DataUtils.generateDragonEquipmentBuffs(equipmentName)
		playerDoc.dragonEquipments[equipmentName] -= 1
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.dragonEquipments = playerDoc.dragonEquipments
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDoc.dragons[dragonType]
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var dragon = playerDoc.dragons[dragonType]
		var equipment = dragon.equipments[equipmentCategory]
		if(_.isEmpty(equipment.name)){
			return Promise.reject(new Error("此分类还没有配置装备"))
		}
		if(DataUtils.isDragonEquipmentReachMaxStar(equipment)){
			return Promise.reject(new Error("装备已到最高星级"))
		}
		if(!LogicUtils.isEnhanceDragonEquipmentLegal(playerDoc, equipments)){
			return Promise.reject(new Error("被强化的装备不存在或数量不足"))
		}
		var playerData = {}
		DataUtils.enhanceDragonEquipment(playerDoc, dragonType, equipmentCategory, equipments)
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDoc.dragons[dragonType]
		playerData.dragonEquipments = playerDoc.dragonEquipments
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var dragon = playerDoc.dragons[dragonType]
		var equipment = dragon.equipments[equipmentCategory]
		if(_.isEmpty(equipment.name)){
			return Promise.reject(new Error("此分类还没有配置装备"))
		}
		if(playerDoc.dragonEquipments[equipment.name] <= 0){
			return Promise.reject(new Error("仓库中没有此装备"))
		}
		var playerData = {}
		equipment.buffs = DataUtils.generateDragonEquipmentBuffs(equipment.name)
		playerDoc.dragonEquipments[equipment.name] -= 1
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDoc.dragons[dragonType]
		playerData.dragonEquipmentEvents = playerDoc.dragonEquipmentEvents
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var dragon = playerDoc.dragons[dragonType]
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
		var upgradeRequired = DataUtils.getDragonSkillUpgradeRequired(playerDoc, dragon, skill)
		var playerData = {}
		LogicUtils.refreshPlayerResources(playerDoc)
		if(playerDoc.resources.energy < upgradeRequired.energy){
			return Promise.reject(new Error("能量不足"))
		}
		if(playerDoc.resources.blood < upgradeRequired.blood){
			return Promise.reject(new Error("英雄之血不足"))
		}
		skill.level += 1
		playerDoc.resources.energy -= upgradeRequired.energy
		playerDoc.resources.blood -= upgradeRequired.blood
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDoc.dragons[dragonType]
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var dragon = playerDoc.dragons[dragonType]
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
		var playerData = {}
		dragon.star += 1
		dragon.vitality = DataUtils.getDragonMaxVitality(playerDoc, dragon)
		dragon.strength = DataUtils.getDragonStrength(playerDoc, dragon)
		_.each(dragon.equipments, function(equipment){
			equipment.name = ""
			equipment.star = 0
			equipment.exp = 0
			equipment.buffs = []
		})
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.dragons = {}
		playerData.dragons[dragonType] = playerDoc.dragons[dragonType]
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
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var building = playerDoc.buildings["location_15"]
		if(building.level <= 0){
			return Promise.reject(new Error("市政厅还未建造"))
		}
		if(playerDoc.coinEvents.length > 0){
			return Promise.reject(new Error("正在收税中"))
		}
		LogicUtils.refreshPlayerResources(playerDoc)
		var required = DataUtils.getImposeRequired(playerDoc)
		var imposedCoin = DataUtils.getImposedCoin(playerDoc)
		if(required.citizen > playerDoc.resources.citizen){
			return Promise.reject(new Error("空闲城民不足"))
		}
		var playerData = {}
		playerDoc.resources.citizen -= required.citizen
		var finishTime = Date.now() + (required.imposeTime * 1000)
		LogicUtils.addCoinEvent(playerDoc, imposedCoin, finishTime)
		eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, finishTime])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		LogicUtils.refreshPlayerResources(playerDoc)
		playerData.basicInfo = playerDoc.basicInfo
		playerData.resources = playerDoc.resources
		playerData.coinEvents = playerDoc.coinEvents
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
 * 设置玩家语言
 * @param playerId
 * @param language
 * @param callback
 */
pro.setPlayerLanguage = function(playerId, language, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.contains(Consts.AllianceLanguage, language)){
		callback(new Error("language 不合法"))
		return
	}
	var self = this
	var playerDoc = null
	var updateFuncs = []
	var eventFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var playerData = {}
		playerDoc.basicInfo.language = language
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		playerData.basicInfo = playerDoc.basicInfo
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
 * 获取玩家个人信息
 * @param playerId
 * @param memberId
 * @param callback
 */
pro.getPlayerInfo = function(playerId, memberId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(memberId)){
		callback(new Error("memberId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(memberId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		return self.playerDao.removeLockByIdAsync(playerDoc._id)
	}).then(function(){
		return self.pushService.onGetPlayerInfoSuccessAsync(playerDoc)
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
 * 发送个人邮件
 * @param playerId
 * @param memberName
 * @param title
 * @param content
 * @param callback
 */
pro.sendMail = function(playerId, memberName, title, content, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(memberName)){
		callback(new Error("memberName 不合法"))
		return
	}
	if(!_.isString(title)){
		callback(new Error("title 不合法"))
		return
	}
	if(!_.isString(content)){
		callback(new Error("content 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var memberDoc = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(_.isEqual(playerDoc.basicInfo.name, memberName)){
			return Promise.reject(new Error("不能给自己发邮件"))
		}
		return self.playerDao.findByIndexAsync("basicInfo.name", memberName)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}

		memberDoc = doc
		var mailToMember = {
			id:ShortId.generate(),
			title:title,
			fromId:playerDoc._id,
			fromName:playerDoc.basicInfo.name,
			fromAllianceTag:(!!playerDoc.alliance && !!playerDoc.alliance.id) ? playerDoc.alliance.tag : "",
			content:content,
			sendTime:Date.now(),
			isRead:false,
			isSaved:false
		}
		if(memberDoc.mails.length >= Define.PlayerMailInboxMessageMaxSize){
			memberDoc.mails.shift()
		}
		memberDoc.mails.push(mailToMember)

		var mailToPlayer = {
			title:title,
			fromName:playerDoc.basicInfo.name,
			fromAllianceTag:(!!playerDoc.alliance && !!playerDoc.alliance.id) ? playerDoc.alliance.tag : "",
			toId:memberDoc._id,
			toName:memberDoc.basicInfo.name,
			content:content,
			sendTime:Date.now()
		}
		if(playerDoc.sendMails.length >= Define.PlayerMailSendboxMessageMaxSize){
			playerDoc.sendMails.shift()
		}
		playerDoc.sendMails.push(mailToPlayer)

		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
		pushFuncs.push([self.pushService, self.pushService.onSendMailSuccessAsync, playerDoc, mailToPlayer])
		pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, memberDoc, mailToMember])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(_.isObject(memberDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 阅读邮件
 * @param playerId
 * @param mailId
 * @param callback
 */
pro.readMail = function(playerId, mailId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(mailId)){
		callback(new Error("mailId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var mail = LogicUtils.getPlayerMailById(playerDoc, mailId)
		if(!_.isObject(mail)){
			return Promise.reject(new Error("邮件不存在"))
		}
		mail.isRead = true
		return self.playerDao.updateAsync(playerDoc)
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
 * 收藏邮件
 * @param playerId
 * @param mailId
 * @param callback
 */
pro.saveMail = function(playerId, mailId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(mailId)){
		callback(new Error("mailId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var mail = LogicUtils.getPlayerMailById(playerDoc, mailId)
		if(!_.isObject(mail)){
			return Promise.reject(new Error("邮件不存在"))
		}
		if(playerDoc.savedMails.length >= Define.PlayerMailFavoriteMessageMaxSize){
			playerDoc.savedMails.shift()
		}
		mail.isSaved = true
		var savedMail = Utils.clone(mail)
		delete savedMail.isRead
		delete savedMail.isSaved
		playerDoc.savedMails.push(savedMail)
		return self.playerDao.updateAsync(playerDoc)
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
 * 取消收藏邮件
 * @param playerId
 * @param mailId
 * @param callback
 */
pro.unSaveMail = function(playerId, mailId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(mailId)){
		callback(new Error("mailId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var mailInSavedMails = LogicUtils.getPlayerSavedMailById(playerDoc, mailId)
		var mailInMails = LogicUtils.getPlayerMailById(playerDoc, mailId)
		if(!_.isObject(mailInSavedMails)){
			return Promise.reject(new Error("邮件不存在"))
		}
		LogicUtils.removeItemInArray(playerDoc.savedMails, mailInSavedMails)
		if(_.isObject(mailInMails)){
			mailInMails.isSaved = false
		}
		return self.playerDao.updateAsync(playerDoc)
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
 * 获取玩家邮件
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getMails = function(playerId, fromIndex, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(fromIndex) || fromIndex % 1 !== 0 || fromIndex < 0){
		callback(new Error("fromIndex 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		return self.playerDao.removeLockByIdAsync(playerDoc._id)
	}).then(function(){
		return self.pushService.onGetMailsSuccessAsync(playerDoc, fromIndex)
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
 * 获取玩家已发邮件
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getSendMails = function(playerId, fromIndex, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(fromIndex) || fromIndex % 1 !== 0 || fromIndex < 0){
		callback(new Error("fromIndex 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		return self.playerDao.removeLockByIdAsync(playerDoc._id)
	}).then(function(){
		return self.pushService.onGetSendMailsSuccessAsync(playerDoc, fromIndex)
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
 * 获取玩家已存邮件
 * @param playerId
 * @param fromIndex
 * @param callback
 */
pro.getSavedMails = function(playerId, fromIndex, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isNumber(fromIndex) || fromIndex % 1 !== 0 || fromIndex < 0){
		callback(new Error("fromIndex 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		return self.playerDao.removeLockByIdAsync(playerDoc._id)
	}).then(function(){
		return self.pushService.onGetSavedMailsSuccessAsync(playerDoc, fromIndex)
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
 * 删除邮件
 * @param playerId
 * @param mailId
 * @param callback
 */
pro.deleteMail = function(playerId, mailId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(mailId)){
		callback(new Error("mailId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		var mail = LogicUtils.getPlayerMailById(playerDoc, mailId)
		if(!_.isObject(mail)){
			return Promise.reject(new Error("邮件不存在"))
		}
		LogicUtils.removeItemInArray(playerDoc.mails, mail)
		return self.playerDao.updateAsync(playerDoc)
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
 * 发送联盟邮件
 * @param playerId
 * @param title
 * @param content
 * @param callback
 */
pro.sendAllianceMail = function(playerId, title, content, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(title)){
		callback(new Error("title 不合法"))
		return
	}
	if(!_.isString(content)){
		callback(new Error("content 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var memberDocs = []
	var pushFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "sendAllianceMail")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, allianceDoc._id])
		var mailToPlayer = {
			title:title,
			fromName:playerDoc.basicInfo.name,
			fromAllianceTag:(!!playerDoc.alliance && !!playerDoc.alliance.id) ? playerDoc.alliance.tag : "",
			toId:"__allianceMembers",
			toName:"__allianceMembers",
			content:content,
			sendTime:Date.now()
		}
		var mailToMember = {
			id:ShortId.generate(),
			title:title,
			fromId:playerDoc._id,
			fromName:playerDoc.basicInfo.name,
			fromAllianceTag:playerDoc.alliance.tag,
			content:content,
			sendTime:Date.now(),
			isRead:false,
			isSaved:false
		}

		if(playerDoc.sendMails.length >= Define.PlayerMailSendboxMessageMaxSize){
			playerDoc.sendMails.shift()
		}
		playerDoc.sendMails.push(mailToPlayer)
		if(playerDoc.mails.length >= Define.PlayerMailInboxMessageMaxSize){
			playerDoc.mails.shift()
		}
		playerDoc.mails.push(mailToMember)
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onSendMailSuccessAsync, playerDoc, mailToPlayer])
		pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, playerDoc, mailToMember])

		var sendMailToMember = function(member){
			return self.playerDao.findByIdAsync(member.id).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("玩家不存在"))
				}
				memberDocs.push(doc)
				if(doc.mails.length >= Define.PlayerMailInboxMessageMaxSize){
					doc.mails.shift()
				}
				doc.mails.push(mailToMember)
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, doc, mailToMember])
				return Promise.resolve()
			}).catch(function(e){
				return Promise.reject(e)
			})
		}
		var funcs = []
		_.each(allianceDoc.members, function(member){
			if(!_.isEqual(member.id, playerDoc._id)){
				funcs.push(sendMailToMember(member))
			}
		})
		return Promise.all(funcs)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		_.each(memberDocs, function(memberDoc){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
	var playerDoc = null
	var allianceDoc = null
	var allianceFinded = null
	var pushFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!!playerDoc.alliance && !_.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家已加入了联盟"))
		}
		var gemUsed = DataUtils.getGemByCreateAlliance()
		if(playerDoc.resources.gem < gemUsed){
			return Promise.reject(new Error("宝石不足"))
		}
		playerDoc.resources.gem -= gemUsed
		return Promise.resolve()
	}).then(function(){
		return self.allianceDao.findByIndexAsync("basicInfo.name", name)
	}).then(function(doc){
		if(_.isObject(doc)){
			allianceFinded = doc
			return Promise.reject(new Error("联盟名称已经存在"))
		}
		return self.allianceDao.findByIndexAsync("basicInfo.tag", tag)
	}).then(function(doc){
		if(_.isObject(doc)){
			allianceFinded = doc
			return Promise.reject(new Error("联盟标签已经存在"))
		}

		var alliance = {
			basicInfo:{
				name:name,
				tag:tag,
				language:language,
				terrain:terrain,
				flag:flag
			}
		}
		return self.allianceDao.createAsync(alliance)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟创建失败"))
		}
		allianceDoc = doc
		LogicUtils.addAllianceMember(allianceDoc, playerDoc, Consts.AllianceTitle.Archon)
		LogicUtils.refreshAlliance(allianceDoc)
		playerDoc.alliance = {
			id:allianceDoc._id,
			name:allianceDoc.basicInfo.name,
			tag:allianceDoc.basicInfo.tag,
			title:Consts.AllianceTitle.Archon,
			titleName:allianceDoc.titles.archon
		}
		var playerData = {}
		playerData.alliance = playerDoc.alliance
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		updateFuncs.push([self.globalChannelService, self.globalChannelService.addAsync, Consts.AllianceChannelPrefix + allianceDoc._id, playerDoc._id, playerDoc.logicServerId])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onGetAllianceDataSuccessAsync, playerDoc, allianceDoc])
		playerData.alliance = playerDoc.alliance
		playerData.resources = playerDoc.resources
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).then(function(){
		callback()
	}).catch(function(e){
		var funcs = []
		if(_.isObject(playerDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		}
		if(_.isObject(allianceFinded)){
			funcs.push(self.allianceDao.removeLockByIdAsync(allianceFinded._id))
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
 * 获取能直接加入的联盟
 * @param playerId
 * @param callback
 */
pro.getCanDirectJoinAlliances = function(playerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
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
		funcs.push(self.allianceDao.getModel().find({"basicInfo.joinType":Consts.AllianceJoinType.All}).sort({"basicInfo.power":-1}).limit(10).exec())
		return Promise.all(funcs)
	}).spread(function(tmp, docs){
		return self.pushService.onGetCanDirectJoinAlliancesSuccessAsync(playerDoc, docs)
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
 * 搜索联盟
 * @param playerId
 * @param tag
 * @param callback
 */
pro.searchAllianceByTag = function(playerId, tag, callback){
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
		return self.pushService.onSearchAlliancesSuccessAsync(playerDoc, docs)
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
 * 编辑联盟基础信息
 * @param playerId
 * @param name
 * @param tag
 * @param language
 * @param terrain
 * @param flag
 * @param callback
 */
pro.editAllianceBasicInfo = function(playerId, name, tag, language, terrain, flag, callback){
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
	var playerDoc = null
	var allianceDoc = null
	var allianceDocFinded = null
	var allianceMemberDocs = []
	var pushFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "editAllianceBasicInfo")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		if(_.isEqual(allianceDoc.basicInfo.name, name)){
			return Promise.resolve(allianceDoc)
		}else{
			return self.allianceDao.findByIndexAsync("basicInfo.name", name)
		}
	}).then(function(doc){
		if(_.isObject(doc) && !_.isEqual(doc._id, allianceDoc._id)){
			allianceDocFinded = doc
			return Promise.reject(new Error("联盟名称已经存在"))
		}
		if(_.isEqual(allianceDoc.basicInfo.tag, tag)){
			return Promise.resolve(allianceDoc)
		}else{
			return self.allianceDao.findByIndexAsync("basicInfo.tag", tag)
		}
	}).then(function(doc){
		if(_.isObject(doc) && !_.isEqual(doc._id, allianceDoc._id)){
			allianceDocFinded = doc
			return Promise.reject(new Error("联盟标签已经存在"))
		}
		var isNameChanged = !_.isEqual(allianceDoc.basicInfo.name, name)
		var isTagChanged = !_.isEqual(allianceDoc.basicInfo.tag, tag)
		var isFlagChanged = !_.isEqual(allianceDoc.basicInfo.flag, flag)
		var isTerrainChanged = !_.isEqual(allianceDoc.basicInfo.terrain, terrain)
		var isLanguageChanged = !_.isEqual(allianceDoc.basicInfo.language, language)
		allianceDoc.basicInfo.name = name
		allianceDoc.basicInfo.tag = tag
		allianceDoc.basicInfo.language = language
		allianceDoc.basicInfo.terrain = terrain
		allianceDoc.basicInfo.flag = flag
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		if(isNameChanged){
			LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Important, Consts.AllianceEventType.Name, playerDoc.basicInfo.name, [allianceDoc.basicInfo.name])
		}
		if(isTagChanged){
			LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Important, Consts.AllianceEventType.Tag, playerDoc.basicInfo.name, [allianceDoc.basicInfo.tag])
		}
		if(isFlagChanged){
			LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Important, Consts.AllianceEventType.Flag, playerDoc.basicInfo.name, [allianceDoc.basicInfo.flag])
		}
		if(isTerrainChanged){
			LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Important, Consts.AllianceEventType.Terrain, playerDoc.basicInfo.name, [allianceDoc.basicInfo.terrain])
		}
		if(isLanguageChanged){
			LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Important, Consts.AllianceEventType.Language, playerDoc.basicInfo.name, [allianceDoc.basicInfo.language])
		}

		if(isNameChanged || isTagChanged){
			playerDoc.alliance.name = name
			playerDoc.alliance.tag = tag
			var playerData = {}
			playerData.alliance = playerDoc.alliance
			updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		}else{
			updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		}

		if(isNameChanged || isTagChanged){
			var funcs = []
			var updateMember = function(member){
				return self.playerDao.findByIdAsync(member.id).then(function(doc){
					if(!_.isObject(doc)){
						return Promise.reject(new Error("玩家不存在"))
					}
					allianceMemberDocs.push(doc)
					doc.alliance.name = name
					doc.alliance.tag = tag
					var memberData = {}
					memberData.alliance = doc.alliance
					updateFuncs.push([self.playerDao, self.playerDao.updateAsync, doc])
					pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, doc, memberData])
					return Promise.resolve()
				}).catch(function(e){
					return Promise.reject(e)
				})
			}
			_.each(allianceDoc.members, function(member){
				if(!_.isEqual(member.id, playerDoc._id)){
					funcs.push(updateMember(member))
				}
			})
			return Promise.all(funcs)
		}
		return Promise.resolve()
	}).then(function(){
		var allianceData = {}
		allianceData.basicInfo = allianceDoc.basicInfo
		allianceData.events = allianceDoc.events
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return LogicUtils.excuteAll(updateFuncs)
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
		if(_.isObject(allianceDocFinded)){
			funcs.push(self.allianceDao.removeLockByIdAsync(allianceDocFinded._id))
		}
		_.each(allianceMemberDocs, function(memberDoc){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 编辑职位名称
 * @param playerId
 * @param title
 * @param titleName
 * @param callback
 */
pro.editTitleName = function(playerId, title, titleName, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.contains(Consts.AllianceTitle, title)){
		callback(new Error("title 不合法"))
		return
	}
	if(!_.isString(titleName)){
		callback(new Error("titleName 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var allianceMemberDocs = []
	var pushFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "editTitleName")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		allianceDoc.titles[title] = titleName
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		if(_.isEqual(playerDoc.alliance.title, title)){
			playerDoc.alliance.titleName = titleName
			var playerData = {}
			playerData.alliance = playerDoc.alliance
			updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		}else{
			updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		}

		var updateMemberTitleName = function(member){
			return self.playerDao.findByIdAsync(member.id).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("玩家不存在"))
				}
				allianceMemberDocs.push(doc)
				doc.alliance.titleName = titleName
				var memberData = {}
				memberData.alliance = doc.alliance
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, doc, memberData])
				return Promise.resolve()
			}).catch(function(e){
				return Promise.reject(e)
			})
		}
		var funcs = []
		_.each(allianceDoc.members, function(member){
			if(_.isEqual(member.title, title) && !_.isEqual(member.id, playerDoc._id)){
				funcs.push(updateMemberTitleName(member))
			}
		})
		return Promise.all(funcs)
	}).then(function(){
		var allianceData = {}
		allianceData.titles = allianceDoc.titles
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return LogicUtils.excuteAll(updateFuncs)
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
		_.each(allianceMemberDocs, function(memberDoc){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 编辑联盟公告
 * @param playerId
 * @param notice
 * @param callback
 */
pro.editAllianceNotice = function(playerId, notice, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(notice)){
		callback(new Error("notice 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "editAllianceNotice")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		allianceDoc.notice = notice
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Notice, playerDoc.basicInfo.name, [])
		var funcs = []
		funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		funcs.push(self.allianceDao.updateAsync(allianceDoc))
		return Promise.all(funcs)
	}).then(function(){
		var allianceData = {}
		allianceData.notice = allianceDoc.notice
		allianceData.events = allianceDoc.events
		return self.pushService.onAllianceDataChangedAsync(allianceDoc, allianceData)
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
 * 编辑联盟描述
 * @param playerId
 * @param description
 * @param callback
 */
pro.editAllianceDescription = function(playerId, description, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(description)){
		callback(new Error("description 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "editAllianceDescription")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		allianceDoc.desc = description
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Desc, playerDoc.basicInfo.name, [])
		var funcs = []
		funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		funcs.push(self.allianceDao.updateAsync(allianceDoc))
		return Promise.all(funcs)
	}).then(function(){
		var allianceData = {}
		allianceData.desc = allianceDoc.desc
		allianceData.events = allianceDoc.events
		return self.pushService.onAllianceDataChangedAsync(allianceDoc, allianceData)
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
 * 编辑联盟加入方式
 * @param playerId
 * @param joinType
 * @param callback
 */
pro.editAllianceJoinType = function(playerId, joinType, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.contains(Consts.AllianceJoinType, joinType)){
		callback(new Error("joinType 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "editAllianceJoinType")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		allianceDoc.basicInfo.joinType = joinType
		var funcs = []
		funcs.push(self.playerDao.removeLockByIdAsync(playerDoc._id))
		funcs.push(self.allianceDao.updateAsync(allianceDoc))
		return Promise.all(funcs)
	}).then(function(){
		var allianceData = {}
		allianceData.basicInfo = allianceDoc.basicInfo
		return self.pushService.onAllianceDataChangedAsync(allianceDoc, allianceData)
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
 * 修改联盟某个玩家的职位
 * @param playerId
 * @param memberId
 * @param title
 * @param callback
 */
pro.modifyAllianceMemberTitle = function(playerId, memberId, title, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(memberId)){
		callback(new Error("memberId 不合法"))
		return
	}
	if(!_.contains(Consts.AllianceTitle, title)){
		callback(new Error("title 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var memberDoc = null
	var memberInAllianceDoc = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "modifyAllianceMemberTitle")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		var playerInAllianceDoc = LogicUtils.getAllianceMemberById(allianceDoc, playerId)
		memberInAllianceDoc = LogicUtils.getAllianceMemberById(allianceDoc, memberId)
		if(!_.isObject(memberInAllianceDoc)){
			return Promise.reject(new Error("联盟没有此玩家"))
		}
		var myMemberLevel = DataUtils.getAllianceTitleLevel(playerInAllianceDoc.title)
		var currentMemberLevel = DataUtils.getAllianceTitleLevel(memberInAllianceDoc.title)
		var afterMemberLevel = DataUtils.getAllianceTitleLevel(title)
		if(currentMemberLevel <= myMemberLevel){
			return Promise.reject(new Error("不能对职级高于或等于自己的玩家进行升级降级操作"))
		}
		if(afterMemberLevel <= myMemberLevel){
			return Promise.reject(new Error("不能将玩家的职级调整到与自己平级或者比自己高"))
		}
		return self.playerDao.findByIdAsync(memberId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		memberDoc = doc
		memberDoc.alliance.title = title
		memberDoc.alliance.titleName = allianceDoc.titles[title]
		memberInAllianceDoc.title = title
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Promotion, memberInAllianceDoc.name, [memberInAllianceDoc.title])
		var memberData = {}
		memberData.alliance = memberDoc.alliance
		var allianceData = {}
		allianceData.members = allianceDoc.members
		allianceData.events = allianceDoc.events
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		if(_.isObject(memberDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 将玩家踢出联盟
 * @param playerId
 * @param memberId
 * @param callback
 */
pro.kickAllianceMemberOff = function(playerId, memberId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(memberId)){
		callback(new Error("memberId 不合法"))
		return
	}
	if(_.isEqual(playerId, memberId)){
		callback(new Error("不能将自己踢出联盟"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var memberDoc = null
	var memberInAllianceDoc = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "modifyAllianceMemberTitle")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		var playerInAllianceDoc = LogicUtils.getAllianceMemberById(allianceDoc, playerId)
		memberInAllianceDoc = LogicUtils.getAllianceMemberById(allianceDoc, memberId)
		if(!_.isObject(memberInAllianceDoc)){
			return Promise.reject(new Error("联盟没有此玩家"))
		}
		var myMemberLevel = DataUtils.getAllianceTitleLevel(playerInAllianceDoc.title)
		var currentMemberLevel = DataUtils.getAllianceTitleLevel(memberInAllianceDoc.title)
		if(currentMemberLevel <= myMemberLevel){
			return Promise.reject(new Error("不能将职级高于或等于自己的玩家踢出联盟"))
		}
		return self.playerDao.findByIdAsync(memberId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		memberDoc = doc
		memberDoc.alliance = null
		var memberData = {}
		memberData.alliance = {}
		LogicUtils.removeItemInArray(allianceDoc.members, memberInAllianceDoc)
		LogicUtils.refreshAlliance(allianceDoc)
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Kick, memberInAllianceDoc.name, [])
		var allianceData = {}
		allianceData.basicInfo = allianceDoc.basicInfo
		allianceData.members = allianceDoc.members
		allianceData.events = allianceDoc.events
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.globalChannelService, self.globalChannelService.leaveAsync, Consts.AllianceChannelPrefix + allianceDoc._id, memberDoc._id, memberDoc.logicServerId])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		if(_.isObject(memberDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 移交盟主职位
 * @param playerId
 * @param memberId
 * @param callback
 */
pro.handOverArchon = function(playerId, memberId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(memberId)){
		callback(new Error("memberId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var memberDoc = null
	var memberInAllianceDoc = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!_.isEqual(playerDoc.alliance.title, Consts.AllianceTitle.Archon)){
			return Promise.reject(new Error("别逗了,你是不盟主好么"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		return self.playerDao.findByIdAsync(memberId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		memberDoc = doc
		memberInAllianceDoc = LogicUtils.getAllianceMemberById(allianceDoc, memberId)
		if(!_.isObject(memberInAllianceDoc)){
			return Promise.reject(new Error("联盟没有此玩家"))
		}

		var playerInAllianceDoc = LogicUtils.getAllianceMemberById(allianceDoc, playerId)
		playerInAllianceDoc.title = Consts.AllianceTitle.Member
		playerDoc.alliance.title = Consts.AllianceTitle.Member
		playerDoc.alliance.titleName = allianceDoc.titles.member
		var playerData = {}
		playerData.alliance = playerDoc.alliance
		memberInAllianceDoc.title = Consts.AllianceTitle.Archon
		memberDoc.alliance.title = Consts.AllianceTitle.Archon
		memberDoc.alliance.titleName = allianceDoc.titles.archon
		var memberData = {}
		memberData.alliance = memberDoc.alliance
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Important, Consts.AllianceEventType.HandOver, memberDoc.basicInfo.name, [])
		var allianceData = {}
		allianceData.members = allianceDoc.members
		allianceData.events = allianceDoc.events
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		if(_.isObject(memberDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 退出联盟
 * @param playerId
 * @param callback
 */
pro.quitAlliance = function(playerId, callback){
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
	var playerInAlliance = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		if(_.isEqual(playerDoc.alliance.title, Consts.AllianceTitle.Archon) && allianceDoc.members.length > 1){
			return Promise.reject(new Error("别逗了,仅当联盟成员为空时,盟主才能退出联盟"))
		}
		playerInAlliance = LogicUtils.getAllianceMemberById(allianceDoc, playerId)
		LogicUtils.removeItemInArray(allianceDoc.members, playerInAlliance)
		LogicUtils.refreshAlliance(allianceDoc)
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Quit, playerInAlliance.name, [])

		playerDoc.alliance = null
		var playerData = {}
		playerData.alliance = {}
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		if(allianceDoc.members.length <= 0){
			updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, allianceDoc._id])
			updateFuncs.push([self.allianceDao, self.allianceDao.deleteByIdAsync, allianceDoc._id])
			updateFuncs.push([self.globalChannelService, self.globalChannelService.destroyChannelAsync, Consts.AllianceChannelPrefix + allianceDoc._id])
		}else{
			var allianceData = {}
			allianceData.basicInfo = allianceDoc.basicInfo
			allianceData.members = allianceDoc.members
			allianceData.events = allianceDoc.events
			updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
			updateFuncs.push([self.globalChannelService, self.globalChannelService.leaveAsync, Consts.AllianceChannelPrefix + allianceDoc._id, playerDoc._id, playerDoc.logicServerId])
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		}
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
 * 直接加入某联盟
 * @param playerId
 * @param allianceId
 * @param callback
 */
pro.joinAllianceDirectly = function(playerId, allianceId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(allianceId)){
		callback(new Error("allianceId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var inviterDocs = []
	var requestedAllianceDocs = []
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(_.isObject(playerDoc.alliance) && !_.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家已加入联盟"))
		}
		return self.allianceDao.findByIdAsync(allianceId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		if(!_.isEqual(doc.basicInfo.joinType, Consts.AllianceJoinType.All)){
			return Promise.reject(new Error("联盟不允许直接加入"))
		}

		LogicUtils.addAllianceMember(allianceDoc, playerDoc, Consts.AllianceTitle.Member)
		LogicUtils.refreshAlliance(allianceDoc)
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Join, playerDoc.basicInfo.name, [])
		updateFuncs.push([self.globalChannelService, self.globalChannelService.addAsync, Consts.AllianceChannelPrefix + allianceDoc._id, playerDoc._id, playerDoc.logicServerId])

		playerDoc.alliance = {
			id:allianceDoc._id,
			name:allianceDoc.basicInfo.name,
			tag:allianceDoc.basicInfo.tag,
			title:Consts.AllianceTitle.Member,
			titleName:allianceDoc.titles.member
		}
		var playerData = {}
		playerData.alliance = playerDoc.alliance
		var allianceData = {}
		allianceData.basicInfo = allianceDoc.basicInfo
		allianceData.members = allianceDoc.members
		allianceData.events = allianceDoc.events
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onGetAllianceDataSuccessAsync, playerDoc, allianceDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])

		var funcs = []
		var removeRequestEvent = function(event){
			return self.allianceDao.findByIdAsync(event.id).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("联盟不存在"))
				}
				requestedAllianceDocs.push(doc)
				var joinRequestEvent = LogicUtils.getPlayerRequestEventAtAlliance(doc, playerId)
				if(!_.isObject(joinRequestEvent)){
					return Promise.reject(new Error("玩家请求事件不存在"))
				}
				LogicUtils.removeItemInArray(doc.joinRequestEvents, joinRequestEvent)
				updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, doc])
				var docData = {}
				docData.joinRequestEvents = doc.joinRequestEvents
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, doc, docData])
				return Promise.resolve()
			})
		}
		_.each(playerDoc.requestToAllianceEvents, function(event){
			funcs.push(removeRequestEvent(event))
		})
		LogicUtils.clearArray(playerDoc.requestToAllianceEvents)

		var sendMailToInviter = function(inviterId){
			var titleKey = Localizations.Alliance.InviteRejectedTitle
			var contentKey = Localizations.Alliance.InviteRejectedContent
			return self.playerDao.findByIdAsync(inviterId).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("玩家不存在"))
				}
				inviterDocs.push(doc)
				var mail = LogicUtils.sendSystemMail(doc, titleKey, [], contentKey, [playerDoc.basicInfo.name])
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, doc, mail])
			})
		}
		_.each(playerDoc.inviteToAllianceEvents, function(event){
			funcs.push(sendMailToInviter(event.inviterId))
		})
		LogicUtils.clearArray(playerDoc.inviteToAllianceEvents)

		return Promise.all(funcs)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		_.each(requestedAllianceDocs, function(doc){
			funcs.push(self.allianceDao.removeLockByIdAsync(doc))
		})
		_.each(inviterDocs, function(doc){
			funcs.push(self.playerDao.removeLockByIdAsync(doc))
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
 * 申请加入联盟
 * @param playerId
 * @param allianceId
 * @param callback
 */
pro.requestToJoinAlliance = function(playerId, allianceId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(allianceId)){
		callback(new Error("allianceId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(_.isObject(playerDoc.alliance) && !_.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家已加入联盟"))
		}
		if(playerDoc.requestToAllianceEvents.length >= Define.RequestJoinAllianceMessageMaxSize){
			return Promise.reject(new Error("联盟申请已满,请撤消部分申请后再来申请"))
		}
		if(LogicUtils.hasPendingRequestEventToAlliance(playerDoc, allianceId)){
			return Promise.reject(new Error("对此联盟的申请已发出,请耐心等候审核"))
		}
		return self.allianceDao.findByIdAsync(allianceId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		if(doc.joinRequestEvents.length >= Define.AllianceRequestMessageMaxSize){
			return Promise.reject(new Error("此联盟的申请信息已满,请等候其处理后再进行申请"))
		}
		var requestTime = Date.now()
		LogicUtils.addAllianceRequestEvent(allianceDoc, playerDoc, requestTime)
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Request, playerDoc.basicInfo.name, [])
		LogicUtils.addPlayerJoinAllianceEvent(playerDoc, allianceDoc, requestTime)
		var playerData = {}
		playerData.requestToAllianceEvents = playerDoc.requestToAllianceEvents
		var allianceData = {}
		allianceData.joinRequestEvents = allianceDoc.joinRequestEvents
		allianceData.events = allianceDoc.events
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
 * 取消对某联盟的加入申请
 * @param playerId
 * @param allianceId
 * @param callback
 */
pro.cancelJoinAllianceRequest = function(playerId, allianceId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(allianceId)){
		callback(new Error("allianceId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(_.isObject(playerDoc.alliance) && !_.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家已加入联盟"))
		}
		return self.allianceDao.findByIdAsync(allianceId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		var eventInPlayer = LogicUtils.getRequestToAllianceEvent(playerDoc, allianceId)
		if(!_.isObject(eventInPlayer)){
			return Promise.reject(new Error("申请事件不存在"))
		}
		var eventInAlliance = LogicUtils.getPlayerRequestEventAtAlliance(allianceDoc, playerId)
		if(!_.isObject(eventInAlliance)){
			return Promise.reject(new Error("申请事件不存在"))
		}
		LogicUtils.removeItemInArray(playerDoc.requestToAllianceEvents, eventInPlayer)
		LogicUtils.removeItemInArray(allianceDoc.joinRequestEvents, eventInAlliance)
		var playerData = {}
		playerData.requestToAllianceEvents = playerDoc.requestToAllianceEvents
		var allianceData = {}
		allianceData.joinRequestEvents = allianceDoc.joinRequestEvents
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
 * 处理加入联盟申请
 * @param playerId
 * @param memberId
 * @param agree
 * @param callback
 */
pro.handleJoinAllianceRequest = function(playerId, memberId, agree, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(memberId)){
		callback(new Error("memberId 不合法"))
		return
	}
	if(!_.isBoolean(agree)){
		callback(new Error("agree 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var memberDoc = null
	var requestedAllianceDocs = []
	var inviterDocs = []
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "handleJoinAllianceRequest")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		return self.allianceDao.findByIdAsync(playerDoc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		return self.playerDao.findByIdAsync(memberId)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		memberDoc = doc
		var eventInMember = LogicUtils.getRequestToAllianceEvent(memberDoc, allianceDoc._id)
		if(!_.isObject(eventInMember)){
			return Promise.reject(new Error("申请事件不存在"))
		}
		var eventInAlliance = LogicUtils.getPlayerRequestEventAtAlliance(allianceDoc, memberId)
		if(!_.isObject(eventInAlliance)){
			return Promise.reject(new Error("申请事件不存在"))
		}
		var memberData = {}
		var allianceData = {}
		LogicUtils.removeItemInArray(memberDoc.requestToAllianceEvents, eventInMember)
		LogicUtils.removeItemInArray(allianceDoc.joinRequestEvents, eventInAlliance)
		memberData.requestToAllianceEvents = memberDoc.requestToAllianceEvents
		allianceData.joinRequestEvents = allianceDoc.joinRequestEvents

		var titleKeyApproved = Localizations.Alliance.RequestApprovedTitle
		var titleKeyRejected = Localizations.Alliance.RequestRejectedTitle
		var contentKeyApproved = Localizations.Alliance.RequestApprovedContent
		var contentKeyRejected = Localizations.Alliance.RequestRejectedContent
		var titleKey = agree ? titleKeyApproved : titleKeyRejected
		var contentKey = agree ? contentKeyApproved : contentKeyRejected
		var mail = LogicUtils.sendSystemMail(memberDoc, titleKey, [], contentKey, [allianceDoc.basicInfo.name])

		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
		pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, memberDoc, mail])
		if(!agree){
			return Promise.resolve()
		}
		LogicUtils.addAllianceMember(allianceDoc, memberDoc, Consts.AllianceTitle.Member)
		LogicUtils.refreshAlliance(allianceDoc)
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Join, memberDoc.basicInfo.name, [])
		allianceData.basicInfo = allianceDoc.basicInfo
		allianceData.members = allianceDoc.members
		allianceData.events = allianceDoc.events
		if(!_.isEmpty(memberDoc.logicServerId)){
			updateFuncs.push([self.globalChannelService, self.globalChannelService.addAsync, Consts.AllianceChannelPrefix + allianceDoc._id, memberDoc._id, memberDoc.logicServerId])
		}

		memberDoc.alliance = {
			id:allianceDoc._id,
			name:allianceDoc.basicInfo.name,
			tag:allianceDoc.basicInfo.tag,
			title:Consts.AllianceTitle.Member,
			titleName:allianceDoc.titles.member
		}
		memberData.alliance = memberDoc.alliance
		pushFuncs.push([self.pushService, self.pushService.onGetAllianceDataSuccessAsync, memberDoc, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		var funcs = []
		var removeRequestEvent = function(event){
			return self.allianceDao.findByIdAsync(event.id).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("联盟不存在"))
				}
				requestedAllianceDocs.push(doc)
				var joinRequestEvent = LogicUtils.getPlayerRequestEventAtAlliance(doc, memberId)
				if(!_.isObject(joinRequestEvent)){
					return Promise.reject(new Error("玩家请求事件不存在"))
				}
				LogicUtils.removeItemInArray(doc.joinRequestEvents, joinRequestEvent)
				var docData = {}
				docData.joinRequestEvents = allianceDoc.joinRequestEvents
				updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, doc, docData])
				return Promise.resolve()
			})
		}
		_.each(memberDoc.requestToAllianceEvents, function(event){
			funcs.push(removeRequestEvent(event))
		})
		LogicUtils.clearArray(memberDoc.requestToAllianceEvents)

		var sendMailToInviter = function(inviterId){
			var titleKey = Localizations.Alliance.InviteRejectedTitle
			var contentKey = Localizations.Alliance.InviteRejectedContent
			return self.playerDao.findByIdAsync(inviterId).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("玩家不存在"))
				}
				inviterDocs.push(doc)
				var mail = LogicUtils.sendSystemMail(doc, titleKey, [], contentKey, [memberDoc.basicInfo.name])
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onNewMailReceived, doc, mail])
				return Promise.resolve()
			})
		}
		_.each(memberDoc.inviteToAllianceEvents, function(event){
			funcs.push(sendMailToInviter(event.inviterId))
		})
		LogicUtils.clearArray(memberDoc.inviteToAllianceEvents)
		return Promise.all(funcs)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		if(_.isObject(memberDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
		}
		_.each(requestedAllianceDocs, function(doc){
			funcs.push(self.allianceDao.removeLockByIdAsync(doc))
		})
		_.each(inviterDocs, function(doc){
			funcs.push(self.playerDao.removeLockByIdAsync(doc))
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
 * 邀请玩家加入联盟
 * @param playerId
 * @param memberId
 * @param callback
 */
pro.inviteToJoinAlliance = function(playerId, memberId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(memberId)){
		callback(new Error("memberId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var memberDoc = null
	var allianceDoc = null
	var updateFuncs = []
	var pushFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(playerDoc.alliance) || _.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(!DataUtils.isAllianceOperationLegal(playerDoc.alliance.title, "inviteToJoinAlliance")){
			return Promise.reject(new Error("此操作权限不足"))
		}
		var funcs = []
		funcs.push(self.allianceDao.findByIdAsync(playerDoc.alliance.id))
		funcs.push(self.playerDao.findByIdAsync(memberId))
		return Promise.all(funcs)
	}).spread(function(theAllianceDoc, theMemberDoc){
		if(!_.isObject(theAllianceDoc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = theAllianceDoc
		if(!_.isObject(theMemberDoc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		memberDoc = theMemberDoc
		if(_.isObject(theMemberDoc.alliance) && !_.isEmpty(theMemberDoc.alliance.id)){
			return Promise.reject(new Error("玩家已加入联盟"))
		}
		if(theMemberDoc.inviteToAllianceEvents.length >= Define.InviteJoinAllianceMessageMaxSize){
			return Promise.reject(new Error("此玩家的邀请信息已满,请等候其处理后再进行邀请"))
		}
		var inviteTime = Date.now()
		LogicUtils.addPlayerInviteAllianceEvent(playerDoc._id, memberDoc, allianceDoc, inviteTime)

		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, allianceDoc._id])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
		var memberData = {}
		memberData.inviteToAllianceEvents = memberDoc.inviteToAllianceEvents
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		if(_.isObject(memberDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 处理加入联盟邀请
 * @param playerId
 * @param allianceId
 * @param agree
 * @param callback
 */
pro.handleJoinAllianceInvite = function(playerId, allianceId, agree, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(allianceId)){
		callback(new Error("allianceId 不合法"))
		return
	}
	if(!_.isBoolean(agree)){
		callback(new Error("agree 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var inviterDoc = null
	var inviteEvent = null
	var requestedAllianceDocs = []
	var inviterDocs = []
	var pushFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(_.isObject(playerDoc.alliance) && !_.isEmpty(playerDoc.alliance.id)){
			return Promise.reject(new Error("玩家已加入联盟"))
		}
		var event = LogicUtils.getInviteToAllianceEvent(playerDoc, allianceId)
		if(!_.isObject(event)){
			return Promise.reject(new Error("邀请事件不存在"))
		}
		inviteEvent = event
		var funcs = []
		funcs.push(self.allianceDao.findByIdAsync(allianceId))
		funcs.push(self.playerDao.findByIdAsync(inviteEvent.inviterId))
		return Promise.all(funcs)
	}).spread(function(theAllianceDoc, theInviterDoc){
		if(!_.isObject(theAllianceDoc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = theAllianceDoc
		if(!_.isObject(theInviterDoc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		inviterDoc = theInviterDoc
		LogicUtils.removeItemInArray(playerDoc.inviteToAllianceEvents, inviteEvent)
		var playerData = {}
		playerData.inviteToAllianceEvents = playerDoc.inviteToAllianceEvents
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])

		var titleKeyApproved = Localizations.Alliance.InviteApprovedTitle
		var titleKeyRejected = Localizations.Alliance.InviteRejectedTitle
		var contentKeyApproved = Localizations.Alliance.InviteApprovedContent
		var contentKeyRejected = Localizations.Alliance.InviteRejectedContent
		var titleKey = agree ? titleKeyApproved : titleKeyRejected
		var contentKey = agree ? contentKeyApproved : contentKeyRejected
		var mail = LogicUtils.sendSystemMail(inviterDoc, titleKey, [], contentKey, [playerDoc.basicInfo.name])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, inviterDoc])
		pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, inviterDoc, mail])

		if(!agree){
			updateFuncs.push([self.allianceDao, self.allianceDao.removeLockByIdAsync, allianceDoc._id])
			return Promise.resolve()
		}
		LogicUtils.addAllianceMember(allianceDoc, playerDoc, Consts.AllianceTitle.Member)
		LogicUtils.refreshAlliance(allianceDoc)
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Normal, Consts.AllianceEventType.Join, playerDoc.basicInfo.name, [])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		updateFuncs.push([self.globalChannelService, self.globalChannelService.addAsync, Consts.AllianceChannelPrefix + allianceDoc._id, playerDoc._id, playerDoc.logicServerId])
		var allianceData = {}
		allianceData.basicInfo = allianceDoc.basicInfo
		allianceData.members = allianceDoc.members
		allianceData.events = allianceDoc.events
		pushFuncs.push([self.pushService, self.pushService.onGetAllianceDataSuccessAsync, playerDoc, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])

		playerDoc.alliance = {
			id:allianceDoc._id,
			name:allianceDoc.basicInfo.name,
			tag:allianceDoc.basicInfo.tag,
			title:Consts.AllianceTitle.Member,
			titleName:allianceDoc.titles.member
		}

		var funcs = []
		var removeRequestEvent = function(event){
			return self.allianceDao.findByIdAsync(event.id).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("联盟不存在"))
				}
				requestedAllianceDocs.push(doc)
				var joinRequestEvent = LogicUtils.getPlayerRequestEventAtAlliance(doc, playerId)
				if(!_.isObject(joinRequestEvent)){
					return Promise.reject(new Error("玩家请求事件不存在"))
				}
				LogicUtils.removeItemInArray(doc.joinRequestEvents, joinRequestEvent)
				var docData = {}
				docData.joinRequestEvents = doc.joinRequestEvents
				updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, doc, docData])
				return Promise.resolve()
			})
		}
		_.each(playerDoc.requestToAllianceEvents, function(event){
			funcs.push(removeRequestEvent(event))
		})
		LogicUtils.clearArray(playerDoc.requestToAllianceEvents)

		var sendMailToInviter = function(inviterId){
			var titleKey = Localizations.Alliance.InviteRejectedTitle
			var contentKey = Localizations.Alliance.InviteRejectedContent
			return self.playerDao.findByIdAsync(inviterId).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("玩家不存在"))
				}
				inviterDocs.push(doc)
				var mail = LogicUtils.sendSystemMail(doc, titleKey, [], contentKey, [playerDoc.basicInfo.name])
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, doc])
				pushFuncs.push([self.pushService, self.pushService.onNewMailReceivedAsync, doc, mail])
				return Promise.resolve()
			})
		}
		_.each(playerDoc.inviteToAllianceEvents, function(event){
			funcs.push(sendMailToInviter(event.inviterId))
		})
		LogicUtils.clearArray(playerDoc.inviteToAllianceEvents)

		return Promise.all(funcs)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		_.each(requestedAllianceDocs, function(doc){
			funcs.push(self.allianceDao.removeLockByIdAsync(doc._id))
		})
		_.each(inviterDocs, function(doc){
			funcs.push(self.playerDao.removeLockByIdAsync(doc._id))
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
 * 盟主长时间不登录时,玩家可宝石购买盟主职位
 * @param playerId
 * @param callback
 */
pro.buyAllianceArchon = function(playerId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var archonDoc = null
	var allianceDoc = null
	var pushFuncs = []
	var updateFuncs = []
	var neededGem = 100
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(doc.alliance) || _.isEmpty(doc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		if(_.isEqual(doc.alliance.title, Consts.AllianceTitle.Archon)){
			return Promise.reject(new Error("玩家已经是盟主了"))
		}
		if(playerDoc.resources.gem < neededGem){
			return Promise.reject(new Error("宝石不足"))
		}
		return self.allianceDao.findByIdAsync(doc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		var archonDocInAlliance = LogicUtils.getAllianceArchon(allianceDoc)
		var canBuyInterval = 0//1000 * 60 * 60 * 24 * 7 //7天
		if(archonDocInAlliance.lastLoginTime + canBuyInterval > Date.now()){
			return Promise.reject(new Error("盟主连续7天不登陆时才能购买盟主职位"))
		}
		return self.playerDao.findByIdAsync(archonDocInAlliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		archonDoc = doc
		playerDoc.resources.gem -= neededGem
		var archonDocInAlliance = LogicUtils.getAllianceArchon(allianceDoc)
		var playerInAllianceDoc = LogicUtils.getAllianceMemberById(allianceDoc, playerId)
		playerInAllianceDoc.title = Consts.AllianceTitle.Archon
		playerDoc.alliance.title = Consts.AllianceTitle.Archon
		playerDoc.alliance.titleName = allianceDoc.titles.archon
		var playerData = {}
		playerData.alliance = playerDoc.alliance
		playerData.resources = playerDoc.resources
		archonDocInAlliance.title = Consts.AllianceTitle.Member
		archonDoc.alliance.title = Consts.AllianceTitle.Member
		archonDoc.alliance.titleName = allianceDoc.titles.member
		var archonData = {}
		archonData.alliance = archonDoc.alliance
		LogicUtils.AddAllianceEvent(allianceDoc, Consts.AllianceEventCategory.Important, Consts.AllianceEventType.HandOver, playerDoc.basicInfo.name, [])
		var allianceData = {}
		allianceData.members = allianceDoc.members
		allianceData.events = allianceDoc.events
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, archonDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, archonDoc, archonData])
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		return Promise.resolve()
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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

pro.requestToSpeedUp = function(playerId, eventType, eventId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.contains(Consts.AllianceHelpEventType, eventType)){
		callback(new Error("eventType 不合法"))
		return
	}
	if(!_.isString(eventId)){
		callback(new Error("eventId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var pushFuncs = []
	var updateFuncs = []
	var buildEvent = null
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(doc.alliance) || _.isEmpty(doc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		buildEvent = LogicUtils.getPlayerBuildEvent(playerDoc, eventType, eventId)
		if(!_.isObject(buildEvent)){
			return Promise.reject(new Error("玩家建造事件不存在"))
		}
		return self.allianceDao.findByIdAsync(doc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		var helpEvent = LogicUtils.getAllianceHelpEvent(allianceDoc, eventId)
		if(_.isObject(helpEvent)){
			return Promise.reject("此建筑已经发送了加速请求")
		}

		var building = LogicUtils.getBuildingByEventTypeAndBuildEvent(playerDoc, eventType, buildEvent)
		var buildingName = _.isEqual(eventType, Consts.AllianceHelpEventType.Wall) ? "wall" : _.isEqual(eventType, Consts.AllianceHelpEventType.Tower) ? "tower" : building.type
		LogicUtils.addAllianceHelpEvent(allianceDoc, playerDoc, building.level + 1, eventType, buildingName, buildEvent.id)
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		var allianceData = {}
		allianceData.helpEvents = allianceDoc.helpEvents
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
 * 协助联盟玩家加速
 * @param playerId
 * @param eventId
 * @param callback
 */
pro.helpAllianceMemberSpeedUp = function(playerId, eventId, callback){
	if(!_.isFunction(callback)){
		throw new Error("callback 不合法")
	}
	if(!_.isString(playerId)){
		callback(new Error("playerId 不合法"))
		return
	}
	if(!_.isString(eventId)){
		callback(new Error("eventId 不合法"))
		return
	}

	var self = this
	var playerDoc = null
	var allianceDoc = null
	var memberDoc = null
	var helpEvent = null
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(doc.alliance) || _.isEmpty(doc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		return self.allianceDao.findByIdAsync(doc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc
		helpEvent = LogicUtils.getAllianceHelpEvent(allianceDoc, eventId)
		if(!_.isObject(helpEvent)){
			return Promise.reject("帮助事件不存在")
		}
		if(_.isEqual(playerDoc._id, helpEvent.id)){
			return Promise.reject(new Error("不能帮助自己加速建造"))
		}
		if(!!_.contains(helpEvent.helpedMembers, playerId)){
			return Promise.reject("玩家已经帮助过此事件了")
		}
		return self.playerDao.findByIdAsync(helpEvent.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		memberDoc = doc
		var buildEvent = LogicUtils.getPlayerBuildEvent(memberDoc, helpEvent.helpEventType, helpEvent.eventId)
		if(!_.isObject(buildEvent)){
			return Promise.reject(new Error("玩家建造事件不存在"))
		}
		helpEvent.helpedMembers.push(playerDoc._id)
		var effect = DataUtils.getPlayerHelpAllianceMemberSpeedUpEffect(playerDoc)
		var newFinishTime = buildEvent.finishTime - effect
		var memberData = {}
		var allianceData = {}
		if(newFinishTime <= Date.now()){
			eventFuncs.push([self, RemovePlayerTimeEvent, memberDoc, buildEvent.finishTime])
			buildEvent.finishTime = newFinishTime
			var params = RefreshPlayerEventsAndGetCallbacks.call(self, memberDoc, null, buildEvent.finishTime, false)
			pushFuncs.concat(params.pushFuncs)
			_.extend(memberData, params.playerData)
			LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
			allianceData.helpEvents = allianceDoc.helpEvents
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
			pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		}else{
			eventFuncs.push([self, UpdatePlayerTimeEvent, memberDoc, buildEvent.finishTime, newFinishTime])
			buildEvent.finishTime = newFinishTime
			var eventsInfo = LogicUtils.getPlayerBuildEvents(memberDoc, helpEvent.helpEventType)
			_.extend(memberData, eventsInfo)
			pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
			if(helpEvent.helpedMembers.length >= helpEvent.maxHelpCount){
				LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
				allianceData.helpEvents = allianceDoc.helpEvents
				pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
			}else{
				pushFuncs.push([self.pushService, self.pushService.onAllianceHelpEventChangedAsync, allianceDoc, helpEvent])
			}
		}
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
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
		if(_.isObject(memberDoc)){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 协助联盟所有玩家加速
 * @param playerId
 * @param callback
 */
pro.helpAllAllianceMemberSpeedUp = function(playerId, callback){
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
	var memberDocs = []
	var eventFuncs = []
	var pushFuncs = []
	var updateFuncs = []
	this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(!_.isObject(doc.alliance) || _.isEmpty(doc.alliance.id)){
			return Promise.reject(new Error("玩家未加入联盟"))
		}
		return self.allianceDao.findByIdAsync(doc.alliance.id)
	}).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("联盟不存在"))
		}
		allianceDoc = doc

		var speedUp = function(memberId, helpEvents){
			var needHelpedEvents = _.filter(helpEvents, function(helpEvent){
				return !_.contains(helpEvent.helpedMembers, playerId)
			})
			if(needHelpedEvents.length <= 0) return Promise.resolve()
			return self.playerDao.findByIdAsync(memberId).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("玩家不存在"))
				}
				var memberDoc = doc
				var memberData = {}
				memberDocs.push(memberDoc)
				for(var i = 0; i < needHelpedEvents.length; i ++){
					var helpEvent = needHelpedEvents[i]
					var buildEvent = LogicUtils.getPlayerBuildEvent(memberDoc, helpEvent.helpEventType, helpEvent.eventId)
					if(!_.isObject(buildEvent)){
						return Promise.reject(new Error("玩家建造事件不存在"))
					}
					helpEvent.helpedMembers.push(playerDoc._id)
					var effect = DataUtils.getPlayerHelpAllianceMemberSpeedUpEffect(playerDoc)
					var newFinishTime = buildEvent.finishTime - effect
					if(newFinishTime <= Date.now()){
						eventFuncs.push([self, RemovePlayerTimeEvent, memberDoc, buildEvent.finishTime])
						buildEvent.finishTime = newFinishTime
						var params = RefreshPlayerEventsAndGetCallbacks.call(self, memberDoc, null, buildEvent.finishTime, false)
						pushFuncs.concat(params.pushFuncs)
						_.extend(memberData, params.playerData)
						LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
					}else{
						eventFuncs.push([self, UpdatePlayerTimeEvent, memberDoc, buildEvent.finishTime, newFinishTime])
						buildEvent.finishTime = newFinishTime
						var eventsInfo = LogicUtils.getPlayerBuildEvents(memberDoc, helpEvent.helpEventType)
						_.extend(memberData, eventsInfo)
						if(helpEvent.helpedMembers.length >= helpEvent.maxHelpCount){
							LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
						}
					}
				}
				updateFuncs.push([self.playerDao, self.playerDao.updateAsync, memberDoc])
				pushFuncs.push([self.pushService, self.pushService.onPlayerDataChangedAsync, memberDoc, memberData])
				return Promise.resolve()
			})
		}
		var funcs = []
		var memberIds = _.pluck(allianceDoc.helpEvents, "id")
		memberIds = _.uniq(memberIds)
		_.each(memberIds, function(memberId){
			var events = _.filter(allianceDoc.helpEvents, function(event){
				return _.isEqual(event.id, memberId)
			})
			if(!_.isEqual(playerDoc._id, memberId)){
				funcs.push(speedUp(memberId, events))
			}
		})
		var allianceData = {}
		allianceData.helpEvents = allianceDoc.helpEvents
		pushFuncs.push([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		updateFuncs.push([self.playerDao, self.playerDao.removeLockByIdAsync, playerDoc._id])
		updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
		return Promise.all(funcs)
	}).then(function(){
		return LogicUtils.excuteAll(updateFuncs)
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
		_.each(memberDocs, function(memberDoc){
			funcs.push(self.playerDao.removeLockByIdAsync(memberDoc._id))
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
 * 执行玩家延迟执行事件
 * @param playerId
 * @param finishTime
 */
var ExcutePlayerCallback = function(playerId, finishTime){
	var self = this
	var pushFuncs = []
	var updateFuncs = []
	var playerDoc = null
	var allianceDoc = null
	return this.playerDao.findByIdAsync(playerId).then(function(doc){
		if(!_.isObject(doc)){
			return Promise.reject(new Error("玩家不存在"))
		}
		playerDoc = doc
		if(_.isObject(playerDoc.alliance) && !_.isEmpty(playerDoc.alliance.id)){
			return self.allianceDao.findByIdAsync(playerDoc.alliance.id).then(function(doc){
				if(!_.isObject(doc)){
					return Promise.reject(new Error("联盟不存在"))
				}
				allianceDoc = doc
				return Promise.resolve()
			})
		}else{
			return Promise.resolve()
		}
	}).then(function(){
		var params = RefreshPlayerEventsAndGetCallbacks.call(self, playerDoc, allianceDoc, finishTime, false)
		pushFuncs = pushFuncs.concat(params.pushFuncs)
		updateFuncs.push([self.playerDao, self.playerDao.updateAsync, playerDoc])
		var playerData = params.playerData
		var allianceData = params.allianceData
		if(!_.isEmpty(allianceData)){
			updateFuncs.push([self.allianceDao, self.allianceDao.updateAsync, allianceDoc])
			pushFuncs.unshift([self.pushService, self.pushService.onAllianceDataChangedAsync, allianceDoc, allianceData])
		}
		pushFuncs.unshift([self.pushService, self.pushService.onPlayerDataChangedAsync, playerDoc, playerData])
		return LogicUtils.excuteAll(updateFuncs)
	}).then(function(){
		return LogicUtils.excuteAll(pushFuncs)
	}).catch(function(e){
		if(_.isObject(playerDoc)){
			self.playerDao.removeLockByIdAsync(playerDoc._id).then(function(){
				return Promise.reject(e)
			})
		}else{
			return Promise.reject(e)
		}
	})
}

/**
 * 玩家登陆后刷新玩家事件数据
 * @param playerDoc
 * @param allianceDoc
 */
var AfterPlayerLogin = function(playerDoc, allianceDoc){
	return RefreshPlayerEventsAndGetCallbacks.call(this, playerDoc, allianceDoc, Date.now(), true)
}

/**
 * 刷新玩家事件
 * @param playerDoc
 * @param allianceDoc
 * @param finishTime
 * @returns {Array}
 */
var RefreshPlayerEvents = function(playerDoc, allianceDoc, finishTime){
	return RefreshPlayerEventsAndGetCallbacks.call(this, playerDoc, allianceDoc, finishTime, false).pushFuncs
}

/**
 * 刷新玩家时间数据并获取返回的执行函数
 * @param playerDoc
 * @param allianceDoc
 * @param finishTime
 * @param isLogin
 * @returns {{pushFuncs: Array, eventFuncs: Array}}
 */
var RefreshPlayerEventsAndGetCallbacks = function(playerDoc, allianceDoc, finishTime, isLogin){
	var self = this
	var pushFuncs = []
	var eventFuncs = []
	var playerData = {}
	var allianceData = {}
	//更新资源数据
	LogicUtils.refreshPlayerResources(playerDoc)
	//检查建筑
	var buildingFinishedEvents = []
	_.each(playerDoc.buildingEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			buildingFinishedEvents.push(event)
			var building = LogicUtils.getBuildingByEvent(playerDoc, event)
			building.level += 1
			//检查是否有建筑需要从-1级升级到0级
			LogicUtils.updateBuildingsLevel(playerDoc)
			playerData.buildings = playerDoc.buildings
			playerData.towers = playerDoc.towers
			playerData.buildingEvents = playerDoc.buildingEvents
			pushFuncs.push([self.pushService, self.pushService.onBuildingLevelUpAsync, playerDoc, event.location])
			if(_.isObject(allianceDoc)){
				var helpEvent = LogicUtils.getAllianceHelpEvent(allianceDoc, event.id)
				if(helpEvent){
					LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
					allianceData.helpEvents = allianceDoc.helpEvents
				}
			}
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(buildingFinishedEvents, playerDoc.buildingEvents)
	//检查小屋
	var houseFinishedEvents = []
	_.each(playerDoc.houseEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			houseFinishedEvents.push(event)
			var house = LogicUtils.getHouseByEvent(playerDoc, event)
			house.level += 1
			playerData.buildings = playerDoc.buildings
			playerData.houseEvents = playerDoc.houseEvents
			pushFuncs.push([self.pushService, self.pushService.onHouseLevelUpAsync, playerDoc, event.buildingLocation, event.houseLocation])
			//如果是住宅,送玩家城民
			if(_.isEqual("dwelling", house.type)){
				var previous = DataUtils.getDwellingPopulationByLevel(house.level - 1)
				var next = DataUtils.getDwellingPopulationByLevel(house.level)
				playerDoc.resources.citizen += next - previous
				LogicUtils.refreshPlayerResources(playerDoc)

			}
			if(_.isObject(allianceDoc)){
				var helpEvent = LogicUtils.getAllianceHelpEvent(allianceDoc, event.id)
				if(helpEvent){
					LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
					allianceData.helpEvents = allianceDoc.helpEvents
				}
			}
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(houseFinishedEvents, playerDoc.houseEvents)
	//检查箭塔
	var towerFinishedEvents = []
	_.each(playerDoc.towerEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			var tower = LogicUtils.getTowerByEvent(playerDoc, event)
			tower.level += 1
			playerData.towers = playerDoc.towers
			playerData.towerEvents = playerDoc.towerEvents
			pushFuncs.push([self.pushService, self.pushService.onTowerLevelUpAsync, playerDoc, event.location])
			towerFinishedEvents.push(event)
			if(_.isObject(allianceDoc)){
				var helpEvent = LogicUtils.getAllianceHelpEvent(allianceDoc, event.id)
				if(helpEvent){
					LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
					allianceData.helpEvents = allianceDoc.helpEvents
				}
			}
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(towerFinishedEvents, playerDoc.towerEvents)
	//检查城墙
	var wallFinishedEvents = []
	_.each(playerDoc.wallEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			var wall = playerDoc.wall
			wall.level += 1
			playerData.wall = playerDoc.wall
			playerData.wallEvents = playerDoc.wallEvents
			pushFuncs.push([self.pushService, self.pushService.onWallLevelUpAsync, playerDoc])
			wallFinishedEvents.push(event)
			if(_.isObject(allianceDoc)){
				var helpEvent = LogicUtils.getAllianceHelpEvent(allianceDoc, event.id)
				if(helpEvent){
					LogicUtils.removeItemInArray(allianceDoc.helpEvents, helpEvent)
					allianceData.helpEvents = allianceDoc.helpEvents
				}
			}
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(wallFinishedEvents, playerDoc.wallEvents)
	//检查材料制造
	_.each(playerDoc.materialEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			event.finishTime = 0
			playerData.materialEvents = playerDoc.materialEvents
			pushFuncs.push([self.pushService, self.pushService.onMakeMaterialFinishedAsync, playerDoc, event])
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	//检查招募事件
	var soldierFinishedEvents = []
	_.each(playerDoc.soldierEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			playerDoc.soldiers[event.name] += event.count
			playerData.soldiers = playerDoc.soldiers
			playerData.soldierEvents = playerDoc.soldierEvents
			pushFuncs.push([self.pushService, self.pushService.onRecruitSoldierSuccessAsync, playerDoc, event.name, event.count])
			soldierFinishedEvents.push(event)
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(soldierFinishedEvents, playerDoc.soldierEvents)
	//检查龙装备制作事件
	var dragonEquipmentFinishedEvents = []
	_.each(playerDoc.dragonEquipmentEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			playerDoc.dragonEquipments[event.name] += 1
			playerData.dragonEquipments = playerDoc.dragonEquipments
			playerData.dragonEquipmentEvents = playerDoc.dragonEquipmentEvents
			pushFuncs.push([self.pushService, self.pushService.onMakeDragonEquipmentSuccessAsync, playerDoc, event.name])
			dragonEquipmentFinishedEvents.push(event)
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(dragonEquipmentFinishedEvents, playerDoc.dragonEquipmentEvents)
	//检查医院治疗伤兵事件
	var treatSoldierFinishedEvents = []
	_.each(playerDoc.treatSoldierEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			_.each(event.soldiers, function(soldier){
				playerDoc.soldiers[soldier.name] += soldier.count
			})
			playerData.soldiers = playerDoc.soldiers
			playerData.treatSoldierEvents = playerDoc.treatSoldierEvents
			pushFuncs.push([self.pushService, self.pushService.onTreatSoldierSuccessAsync, playerDoc, event.soldiers])
			treatSoldierFinishedEvents.push(event)
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(treatSoldierFinishedEvents, playerDoc.treatSoldierEvents)
	//检查城民税收事件
	var coinFinishedEvents = []
	_.each(playerDoc.coinEvents, function(event){
		if(event.finishTime > 0 && event.finishTime <= finishTime){
			playerDoc.resources.coin += event.coin
			playerData.resources = playerDoc.resources
			playerData.coinEvents = playerDoc.coinEvents
			pushFuncs.push([self.pushService, self.pushService.onImposeSuccessAsync, playerDoc, event.coin])
			coinFinishedEvents.push(event)
		}else if(event.finishTime > 0 && isLogin){
			eventFuncs.push([self, AddPlayerTimeEvent, playerDoc, event.finishTime])
		}
	})
	LogicUtils.removeEvents(coinFinishedEvents, playerDoc.coinEvents)

	//刷新玩家战力
	LogicUtils.refreshPlayerPower(playerDoc)
	playerData.basicInfo = playerDoc.basicInfo
	playerData.resources = playerDoc.resources

	var response = {
		pushFuncs:pushFuncs,
		eventFuncs:eventFuncs,
		playerData:playerData,
		allianceData:allianceData
	}

	return response
}

/**
 * 添加时间回调
 * @param key
 * @param eventServerId
 * @param logicServerId
 * @param finishTime
 * @param callback
 */
var AddTimeEvent = function(key, eventServerId, logicServerId, finishTime, callback){
	this.app.rpc.event.eventRemote.addTimeEvent.toServer(eventServerId, key, logicServerId, finishTime, Date.now(), callback)
}

/**
 * 移除时间回调
 * @param key
 * @param eventServerId
 * @param finishTime
 * @param callback
 */
var RemoveTimeEvent = function(key, eventServerId, finishTime, callback){
	this.app.rpc.event.eventRemote.removeTimeEvent.toServer(eventServerId, key, finishTime, callback)
}

/**
 * 更新时间回调
 * @param key
 * @param eventServerId
 * @param oldFinishTime
 * @param newFinishTime
 * @param callback
 */
var UpdateTimeEvent = function(key, eventServerId, oldFinishTime, newFinishTime, callback){
	this.app.rpc.event.eventRemote.updateTimeEvent.toServer(eventServerId, key, oldFinishTime, newFinishTime, Date.now(), callback)
}

/**
 * 清除指定Key的时间回调
 * @param key
 * @param eventServerId
 * @param callback
 */
var ClearTimeEvents = function(key, eventServerId, callback){
	this.app.rpc.event.eventRemote.clearTimeEventsByKey.toServer(eventServerId, key, callback)
}

/**
 * 添加玩家时间回调
 * @param playerDoc
 * @param finishTime
 * @returns {*}
 */
var AddPlayerTimeEvent = function(playerDoc, finishTime){
	if(!_.isEmpty(playerDoc.logicServerId)){
		var key = Consts.TimeEventType.Player + "_" + playerDoc._id
		var addTimeEvent = Promise.promisify(AddTimeEvent, this)
		return addTimeEvent.call(this, key, playerDoc.eventServerId, playerDoc.logicServerId, finishTime)
	}
	return Promise.resolve()
}

/**
 * 移除玩家时间回调
 * @param playerDoc
 * @param finishTime
 * @returns {*}
 */
var RemovePlayerTimeEvent = function(playerDoc, finishTime){
	if(!_.isEmpty(playerDoc.logicServerId)){
		var key = Consts.TimeEventType.Player + "_" + playerDoc._id
		var removeTimeEvent = Promise.promisify(RemoveTimeEvent, this)
		return removeTimeEvent(key, playerDoc.eventServerId, finishTime)
	}
	return Promise.resolve()
}

/**
 * 更新玩家时间回调
 * @param playerDoc
 * @param oldFinishTime
 * @param newFinishTime
 * @returns {*}
 */
var UpdatePlayerTimeEvent = function(playerDoc, oldFinishTime, newFinishTime){
	if(!_.isEmpty(playerDoc.logicServerId)){
		var key = Consts.TimeEventType.Player + "_" + playerDoc._id
		var updateTimeEvent = Promise.promisify(UpdateTimeEvent, this)
		return updateTimeEvent(key, playerDoc.eventServerId, oldFinishTime, newFinishTime)
	}
	return Promise.resolve()
}

/**
 * 清除指定玩家的全部时间回调
 * @param playerDoc
 * @returns {*}
 */
var ClearPlayerTimeEvents = function(playerDoc){
	if(!_.isEmpty(playerDoc.logicServerId)){
		var key = Consts.TimeEventType.Player + "_" + playerDoc._id
		var clearTimeEvents = Promise.promisify(ClearTimeEvents, this)
		return clearTimeEvents(key, playerDoc.eventServerId)
	}
	return Promise.resolve()
}