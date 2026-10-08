--Glotonería - Le Festin de la Novena Espada
--Hueco Mundo (fan-made)
local s,id=GetID()
local SET_ESPADA=0xf70
function s.initial_effect(c)
	local e1=Effect.CreateEffect(c)
	e1:SetCategory(CATEGORY_REMOVE+CATEGORY_ATKCHANGE)
	e1:SetType(EFFECT_TYPE_ACTIVATE)
	e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
	e1:SetCode(EVENT_FREE_CHAIN)
	e1:SetCountLimit(1,id,EFFECT_COUNT_CODE_OATH)
	e1:SetTarget(s.target)
	e1:SetOperation(s.activate)
	c:RegisterEffect(e1)
end
s.listed_series={SET_ESPADA}
function s.efilter(c)
	return c:IsFaceup() and c:IsSetCard(SET_ESPADA)
end
function s.gfilter(c)
	return c:IsMonster() and c:IsAbleToRemove()
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
	if chkc then return false end
	if chk==0 then return Duel.IsExistingTarget(s.efilter,tp,LOCATION_MZONE,0,1,nil)
		and Duel.IsExistingTarget(s.gfilter,tp,LOCATION_GRAVE,LOCATION_GRAVE,1,nil) end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_FACEUP)
	local g1=Duel.SelectTarget(tp,s.efilter,tp,LOCATION_MZONE,0,1,1,nil)
	e:SetLabelObject(g1:GetFirst())
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_REMOVE)
	local g2=Duel.SelectTarget(tp,s.gfilter,tp,LOCATION_GRAVE,LOCATION_GRAVE,1,1,nil)
	Duel.SetOperationInfo(0,CATEGORY_REMOVE,g2,1,0,0)
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	local tc=e:GetLabelObject()
	local g=Duel.GetTargetCards(e)
	local bc=g:Filter(function(x) return x~=tc end,nil):GetFirst()
	if not bc or Duel.Remove(bc,POS_FACEUP,REASON_EFFECT)==0 or not bc:IsLocation(LOCATION_REMOVED) then return end
	if not (tc and tc:IsRelateToEffect(e) and tc:IsFaceup()) then return end
	local atk=math.max(0,bc:GetBaseAttack())//2
	if atk>0 then tc:UpdateAttack(atk,RESETS_STANDARD_PHASE_END,c) end
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_SINGLE)
	e1:SetCode(EFFECT_ADD_CODE)
	e1:SetValue(bc:GetOriginalCode())
	e1:SetReset(RESETS_STANDARD_PHASE_END)
	tc:RegisterEffect(e1)
end
