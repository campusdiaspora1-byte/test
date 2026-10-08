--Ira - La Rage de l'Espada Cero
--Hueco Mundo (fan-made)
local s,id=GetID()
local SET_ESPADA=0xf70
function s.initial_effect(c)
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_ACTIVATE)
	e1:SetCode(EVENT_FREE_CHAIN)
	e1:SetHintTiming(0,TIMING_MAIN_END|TIMING_BATTLE_START|TIMINGS_CHECK_MONSTER_E)
	e1:SetCountLimit(1,id,EFFECT_COUNT_CODE_OATH)
	e1:SetTarget(s.target)
	e1:SetOperation(s.activate)
	c:RegisterEffect(e1)
end
s.listed_series={SET_ESPADA}
function s.atkfilter(c)
	return c:IsFaceup() and c:IsSetCard(SET_ESPADA)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
	if chkc then return e:GetLabel()==2 and chkc:IsLocation(LOCATION_MZONE) and chkc:IsControler(tp) and s.atkfilter(chkc) end
	local b1=Duel.GetFlagEffect(tp,id)==0
	local b2=Duel.IsExistingTarget(s.atkfilter,tp,LOCATION_MZONE,0,1,nil)
		and Duel.IsExistingMatchingCard(aux.AND(Card.IsSetCard,Card.IsMonster),tp,LOCATION_GRAVE,0,1,nil,SET_ESPADA)
	if chk==0 then return b1 or b2 end
	local op=Duel.SelectEffect(tp,{b1,aux.Stringid(id,0)},{b2,aux.Stringid(id,1)})
	e:SetLabel(op)
	if op==2 then
		e:SetProperty(EFFECT_FLAG_CARD_TARGET)
		e:SetCategory(CATEGORY_ATKCHANGE)
		Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_FACEUP)
		Duel.SelectTarget(tp,s.atkfilter,tp,LOCATION_MZONE,0,1,1,nil)
	else
		e:SetProperty(0)
		e:SetCategory(0)
	end
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
	if e:GetLabel()==1 then
		--Jusqu'à la fin du tour : la condition « Las Noches dans votre Cimetière » est ignorée
		Duel.RegisterFlagEffect(tp,id,RESET_PHASE|PHASE_END,0,1)
		aux.RegisterClientHint(e:GetHandler(),0,tp,1,0,aux.Stringid(id,0))
	else
		local tc=Duel.GetFirstTarget()
		local ct=Duel.GetMatchingGroupCount(aux.AND(Card.IsSetCard,Card.IsMonster),tp,LOCATION_GRAVE,0,nil,SET_ESPADA)
		if tc:IsRelateToEffect(e) and tc:IsFaceup() and ct>0 then
			tc:UpdateAttack(ct*500,RESETS_STANDARD_PHASE_END,e:GetHandler())
		end
	end
end
