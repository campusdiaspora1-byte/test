--Ayon - Monstre de la Calamité
--Hueco Mundo (fan-made)
local s,id=GetID()
local CARD_TRES_BESTIAS,TOKEN_FRACCION=711000018,711000027
function s.initial_effect(c)
	c:EnableReviveLimit()
	--Doit d'abord être Invoquée Spécialement (depuis l'Extra Deck) par l'effet de Las Tres Bestias
	local e0=Effect.CreateEffect(c)
	e0:SetType(EFFECT_TYPE_SINGLE)
	e0:SetProperty(EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_UNCOPYABLE)
	e0:SetCode(EFFECT_SPSUMMON_CONDITION)
	e0:SetValue(function(e,se,sp,st) return e:GetHandler():IsStatus(STATUS_PROC_COMPLETE) or (se and se:GetHandler():IsCode(CARD_TRES_BESTIAS)) end)
	c:RegisterEffect(e0)
	--Invoquée Spécialement : gagne 300 ATK par carte adverse
	local e1=Effect.CreateEffect(c)
	e1:SetCategory(CATEGORY_ATKCHANGE)
	e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_F)
	e1:SetCode(EVENT_SPSUMMON_SUCCESS)
	e1:SetOperation(s.atkop)
	c:RegisterEffect(e1)
	--N'est pas affectée par les effets des monstres adverses dont l'ATK est inférieure à la sienne
	local e2=Effect.CreateEffect(c)
	e2:SetType(EFFECT_TYPE_SINGLE)
	e2:SetProperty(EFFECT_FLAG_SINGLE_RANGE)
	e2:SetRange(LOCATION_MZONE)
	e2:SetCode(EFFECT_IMMUNE_EFFECT)
	e2:SetValue(s.immval)
	c:RegisterEffect(e2)
	--Une fois par tour, au début de la Damage Step, si elle combat un monstre adverse : le détruire
	local e3=Effect.CreateEffect(c)
	e3:SetDescription(aux.Stringid(id,0))
	e3:SetCategory(CATEGORY_DESTROY)
	e3:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)
	e3:SetCode(EVENT_BATTLE_START)
	e3:SetCountLimit(1)
	e3:SetCondition(function(e,tp) local bc=e:GetHandler():GetBattleTarget() return bc and bc:IsControler(1-tp) end)
	e3:SetTarget(s.destg)
	e3:SetOperation(s.desop)
	c:RegisterEffect(e3)
end
s.listed_names={CARD_TRES_BESTIAS,TOKEN_FRACCION}
s.material={CARD_TRES_BESTIAS}
function s.atkop(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	local ct=Duel.GetFieldGroupCount(tp,0,LOCATION_ONFIELD)
	if ct>0 and c:IsRelateToEffect(e) and c:IsFaceup() then
		c:UpdateAttack(ct*300,RESET_EVENT|RESETS_STANDARD_DISABLE)
	end
end
function s.immval(e,te)
	local c=e:GetHandler()
	local tc=te:GetHandler()
	return te:GetOwnerPlayer()~=e:GetHandlerPlayer() and te:IsMonsterEffect() and tc:IsFaceup() and tc:GetAttack()<c:GetAttack()
end
function s.destg(e,tp,eg,ep,ev,re,r,rp,chk)
	local bc=e:GetHandler():GetBattleTarget()
	if chk==0 then return bc and bc:IsRelateToBattle() end
	Duel.SetOperationInfo(0,CATEGORY_DESTROY,bc,1,0,0)
end
function s.desop(e,tp,eg,ep,ev,re,r,rp)
	local bc=e:GetHandler():GetBattleTarget()
	if bc and bc:IsRelateToBattle() then
		Duel.Destroy(bc,REASON_EFFECT)
	end
end
