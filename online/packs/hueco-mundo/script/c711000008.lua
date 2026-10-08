--Dominance du Vasto Lorde
--Hueco Mundo (fan-made)
local s,id=GetID()
local SET_ULQUIORRA,CARD_SEGUNDA=0xf72,711000004
function s.initial_effect(c)
	--Activation
	local e0=Effect.CreateEffect(c)
	e0:SetType(EFFECT_TYPE_ACTIVATE)
	e0:SetCode(EVENT_FREE_CHAIN)
	c:RegisterEffect(e0)
	--L'adversaire Invoque Spécialement un monstre de 3000 ATK ou plus pendant que vous contrôlez un « Ulquiorra Cifer »
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O)
	e1:SetProperty(EFFECT_FLAG_DELAY)
	e1:SetCode(EVENT_SPSUMMON_SUCCESS)
	e1:SetRange(LOCATION_SZONE)
	e1:SetCountLimit(1,{id,0})
	e1:SetCondition(s.spcon)
	e1:SetTarget(s.target)
	e1:SetOperation(s.operation)
	c:RegisterEffect(e1)
	--Un monstre adverse déclare une attaque sur un « Ulquiorra Cifer » que vous contrôlez
	local e2=e1:Clone()
	e2:SetCode(EVENT_ATTACK_ANNOUNCE)
	e2:SetProperty(0)
	e2:SetCondition(s.atkcon)
	c:RegisterEffect(e2)
	--Détruite dans votre Zone Magie & Piège par un effet adverse : Invoquer Segunda Etapa depuis le Cimetière
	local e3=Effect.CreateEffect(c)
	e3:SetDescription(aux.Stringid(id,3))
	e3:SetCategory(CATEGORY_SPECIAL_SUMMON)
	e3:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)
	e3:SetProperty(EFFECT_FLAG_DELAY)
	e3:SetCode(EVENT_DESTROYED)
	e3:SetCountLimit(1,{id,1})
	e3:SetCondition(s.sscon)
	e3:SetTarget(s.sstg)
	e3:SetOperation(s.ssop)
	c:RegisterEffect(e3)
end
s.listed_series={SET_ULQUIORRA}
s.listed_names={CARD_SEGUNDA}
function s.spcon(e,tp,eg,ep,ev,re,r,rp)
	return Duel.IsExistingMatchingCard(aux.FaceupFilter(Card.IsSetCard,SET_ULQUIORRA),tp,LOCATION_MZONE,0,1,nil)
		and eg:IsExists(function(c) return c:IsSummonPlayer(1-tp) and c:IsFaceup() and c:IsAttackAbove(3000) end,1,nil)
end
function s.atkcon(e,tp,eg,ep,ev,re,r,rp)
	local d=Duel.GetAttackTarget()
	return Duel.GetAttacker():IsControler(1-tp) and d and d:IsControler(tp) and d:IsFaceup() and d:IsSetCard(SET_ULQUIORRA)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	local g=Duel.GetMatchingGroup(Card.IsFaceup,tp,0,LOCATION_MZONE,nil)
	if chk==0 then return #g>0 end
	local op=Duel.SelectEffect(tp,{true,aux.Stringid(id,1)},{true,aux.Stringid(id,2)})
	e:SetLabel(op)
	if op==1 then
		e:SetCategory(CATEGORY_DISABLE+CATEGORY_ATKCHANGE)
		Duel.SetOperationInfo(0,CATEGORY_DISABLE,g,#g,0,0)
	else
		e:SetCategory(CATEGORY_DESTROY+CATEGORY_DAMAGE)
		Duel.SetOperationInfo(0,CATEGORY_DESTROY,nil,1,1-tp,LOCATION_MZONE)
	end
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	if not c:IsRelateToEffect(e) then return end
	if e:GetLabel()==1 then
		for tc in Duel.GetMatchingGroup(Card.IsFaceup,tp,0,LOCATION_MZONE,nil):Iter() do
			tc:NegateEffects(c,RESET_PHASE|PHASE_END)
			local e1=Effect.CreateEffect(c)
			e1:SetType(EFFECT_TYPE_SINGLE)
			e1:SetCode(EFFECT_SET_ATTACK_FINAL)
			e1:SetValue(0)
			e1:SetReset(RESETS_STANDARD_PHASE_END)
			tc:RegisterEffect(e1)
		end
	else
		local g=Duel.GetMatchingGroup(Card.IsFaceup,tp,0,LOCATION_MZONE,nil)
		if #g==0 then return end
		local mg=g:GetMaxGroup(Card.GetBaseAttack)
		if #mg>1 then
			Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_DESTROY)
			mg=mg:Select(tp,1,1,nil)
		end
		local tc=mg:GetFirst()
		local atk=math.max(0,tc:GetBaseAttack())
		Duel.HintSelection(mg)
		if Duel.Destroy(tc,REASON_EFFECT)>0 then
			Duel.Damage(1-tp,atk//2,REASON_EFFECT)
		end
	end
end
function s.sscon(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	return rp==1-tp and c:IsReason(REASON_EFFECT) and c:IsPreviousLocation(LOCATION_SZONE) and c:IsPreviousControler(tp)
end
function s.ssfilter(c,e,tp)
	return c:IsCode(CARD_SEGUNDA) and c:IsCanBeSpecialSummoned(e,0,tp,false,false)
end
function s.sstg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.GetLocationCount(tp,LOCATION_MZONE)>0
		and Duel.IsExistingMatchingCard(s.ssfilter,tp,LOCATION_GRAVE,0,1,nil,e,tp) end
	Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,1,tp,LOCATION_GRAVE)
end
function s.ssop(e,tp,eg,ep,ev,re,r,rp)
	if Duel.GetLocationCount(tp,LOCATION_MZONE)<=0 then return end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
	local g=Duel.SelectMatchingCard(tp,aux.NecroValleyFilter(s.ssfilter),tp,LOCATION_GRAVE,0,1,1,nil,e,tp)
	if #g>0 then
		Duel.SpecialSummon(g,0,tp,tp,false,false,POS_FACEUP)
	end
end
