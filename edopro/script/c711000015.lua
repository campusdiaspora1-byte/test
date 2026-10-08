--Barragán Luisenbarn - Arrogante
--Hueco Mundo (fan-made)
local s,id=GetID()
local CARD_BARRAGAN,CARD_LAS_NOCHES,CARD_IRA=711000014,711000002,711000023
local COUNTER_VIEILLESSE=0x1f70
local function lnok(tp) return Duel.IsExistingMatchingCard(Card.IsCode,tp,LOCATION_GRAVE,0,1,nil,CARD_LAS_NOCHES) or Duel.GetFlagEffect(tp,CARD_IRA)>0 end
s.counter_place_list={COUNTER_VIEILLESSE}
function s.initial_effect(c)
	c:EnableReviveLimit()
	--« Barragán Luisenbarn - Le Second Espada » + 1 monstre Démon
	Fusion.AddProcMix(c,true,true,CARD_BARRAGAN,aux.FilterBoolFunctionEx(Card.IsRace,RACE_FIEND))
	--Ne peut être Invoquée Spécialement que si Las Noches est dans votre Cimetière
	local e0=Effect.CreateEffect(c)
	e0:SetType(EFFECT_TYPE_SINGLE)
	e0:SetProperty(EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_UNCOPYABLE)
	e0:SetCode(EFFECT_SPSUMMON_CONDITION)
	e0:SetValue(function(e,se,sp,st) return lnok(sp) end)
	c:RegisterEffect(e0)
	--Ne peut pas être détruite par les effets de carte de votre adversaire
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_SINGLE)
	e1:SetProperty(EFFECT_FLAG_SINGLE_RANGE)
	e1:SetRange(LOCATION_MZONE)
	e1:SetCode(EFFECT_INDESTRUCTABLE_EFFECT)
	e1:SetValue(aux.indoval)
	c:RegisterEffect(e1)
	--Une fois par tour (Effet Rapide) : placer 1 Compteur Vieillesse sur 1 carte face recto adverse
	local e2=Effect.CreateEffect(c)
	e2:SetDescription(aux.Stringid(id,0))
	e2:SetCategory(CATEGORY_COUNTER)
	e2:SetType(EFFECT_TYPE_QUICK_O)
	e2:SetCode(EVENT_FREE_CHAIN)
	e2:SetRange(LOCATION_MZONE)
	e2:SetHintTiming(0,TIMINGS_CHECK_MONSTER_E)
	e2:SetCountLimit(1)
	e2:SetTarget(s.cttg)
	e2:SetOperation(s.ctop)
	c:RegisterEffect(e2)
	--Cartes avec un Compteur Vieillesse : effets annulés ; monstres : −1000 ATK/DEF par compteur
	local e3=Effect.CreateEffect(c)
	e3:SetType(EFFECT_TYPE_FIELD)
	e3:SetCode(EFFECT_DISABLE)
	e3:SetRange(LOCATION_MZONE)
	e3:SetTargetRange(0,LOCATION_ONFIELD)
	e3:SetTarget(function(e,c) return c:GetCounter(COUNTER_VIEILLESSE)>0 end)
	c:RegisterEffect(e3)
	local e4=e3:Clone()
	e4:SetCode(EFFECT_DISABLE_EFFECT)
	c:RegisterEffect(e4)
	local e5=Effect.CreateEffect(c)
	e5:SetType(EFFECT_TYPE_FIELD)
	e5:SetCode(EFFECT_UPDATE_ATTACK)
	e5:SetRange(LOCATION_MZONE)
	e5:SetTargetRange(0,LOCATION_MZONE)
	e5:SetTarget(function(e,c) return c:GetCounter(COUNTER_VIEILLESSE)>0 end)
	e5:SetValue(function(e,c) return -1000*c:GetCounter(COUNTER_VIEILLESSE) end)
	c:RegisterEffect(e5)
	local e6=e5:Clone()
	e6:SetCode(EFFECT_UPDATE_DEFENSE)
	c:RegisterEffect(e6)
	--Envoyer au Cimetière tout monstre avec un Compteur Vieillesse dont l'ATK est 0
	local e7=Effect.CreateEffect(c)
	e7:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
	e7:SetCode(EVENT_ADJUST)
	e7:SetRange(LOCATION_MZONE)
	e7:SetOperation(s.adjop)
	c:RegisterEffect(e7)
end
s.listed_names={CARD_BARRAGAN,CARD_LAS_NOCHES}
s.material={CARD_BARRAGAN}
function s.cttg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.IsExistingMatchingCard(Card.IsFaceup,tp,0,LOCATION_ONFIELD,1,nil) end
	Duel.SetOperationInfo(0,CATEGORY_COUNTER,nil,1,0,COUNTER_VIEILLESSE)
end
function s.ctop(e,tp,eg,ep,ev,re,r,rp)
	if not e:GetHandler():IsRelateToEffect(e) then return end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_COUNTER)
	local tc=Duel.SelectMatchingCard(tp,Card.IsFaceup,tp,0,LOCATION_ONFIELD,1,1,nil):GetFirst()
	if tc then
		Duel.HintSelection(tc)
		tc:AddCounter(COUNTER_VIEILLESSE,1)
	end
end
function s.adjop(e,tp,eg,ep,ev,re,r,rp)
	local g=Duel.GetMatchingGroup(function(c) return c:IsFaceup() and c:GetCounter(COUNTER_VIEILLESSE)>0 and c:GetAttack()==0 end,tp,0,LOCATION_MZONE,nil)
	if #g>0 then
		Duel.SendtoGrave(g,REASON_RULE)
		Duel.Readjust()
	end
end
