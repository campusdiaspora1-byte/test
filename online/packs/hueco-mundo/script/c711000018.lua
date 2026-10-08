--Las Tres Bestias - Fracciones de la Chimère
--Hueco Mundo (fan-made)
local s,id=GetID()
local SET_HARRIBEL,CARD_LAS_NOCHES,CARD_AYON,TOKEN_FRACCION=0xf78,711000002,711000019,711000027
function s.initial_effect(c)
	--Invocation Spéciale depuis la main si vous contrôlez un « Tier Harribel » ou Las Noches
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetType(EFFECT_TYPE_FIELD)
	e1:SetCode(EFFECT_SPSUMMON_PROC)
	e1:SetProperty(EFFECT_FLAG_UNCOPYABLE)
	e1:SetRange(LOCATION_HAND)
	e1:SetCountLimit(1,{id,0},EFFECT_COUNT_CODE_OATH)
	e1:SetCondition(s.spcon)
	c:RegisterEffect(e1)
	--Invoquée Normalement ou Spécialement : Invoquer 3 « Jetons Fracción » ; Extra Deck limité aux Démons ce tour
	local e2=Effect.CreateEffect(c)
	e2:SetDescription(aux.Stringid(id,1))
	e2:SetCategory(CATEGORY_SPECIAL_SUMMON+CATEGORY_TOKEN)
	e2:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)
	e2:SetProperty(EFFECT_FLAG_DELAY)
	e2:SetCode(EVENT_SUMMON_SUCCESS)
	e2:SetCountLimit(1,{id,1})
	e2:SetTarget(s.tktg)
	e2:SetOperation(s.tkop)
	c:RegisterEffect(e2)
	local e3=e2:Clone()
	e3:SetCode(EVENT_SPSUMMON_SUCCESS)
	c:RegisterEffect(e3)
	--Sacrifier cette carte et 3 « Jetons Fracción » ; Invoquer Ayon depuis l'Extra Deck
	local e4=Effect.CreateEffect(c)
	e4:SetDescription(aux.Stringid(id,2))
	e4:SetCategory(CATEGORY_SPECIAL_SUMMON)
	e4:SetType(EFFECT_TYPE_IGNITION)
	e4:SetRange(LOCATION_MZONE)
	e4:SetCountLimit(1,{id,2})
	e4:SetCost(s.aycost)
	e4:SetTarget(s.aytg)
	e4:SetOperation(s.ayop)
	c:RegisterEffect(e4)
end
s.listed_series={SET_HARRIBEL}
s.listed_names={CARD_LAS_NOCHES,CARD_AYON,TOKEN_FRACCION}
function s.spcon(e,c)
	if c==nil then return true end
	local tp=c:GetControler()
	return Duel.GetLocationCount(tp,LOCATION_MZONE)>0
		and (Duel.IsExistingMatchingCard(aux.FaceupFilter(Card.IsSetCard,SET_HARRIBEL),tp,LOCATION_MZONE,0,1,nil)
		or Duel.IsExistingMatchingCard(aux.FaceupFilter(Card.IsCode,CARD_LAS_NOCHES),tp,LOCATION_FZONE,0,1,nil))
end
function s.tktg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return not Duel.IsPlayerAffectedByEffect(tp,CARD_BLUEEYES_SPIRIT) and Duel.GetLocationCount(tp,LOCATION_MZONE)>=3
		and Duel.IsPlayerCanSpecialSummonMonster(tp,TOKEN_FRACCION,0,TYPES_TOKEN,500,500,1,RACE_AQUA,ATTRIBUTE_WATER) end
	Duel.SetOperationInfo(0,CATEGORY_TOKEN,nil,3,0,0)
	Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,3,tp,0)
end
function s.tkop(e,tp,eg,ep,ev,re,r,rp)
	if not Duel.IsPlayerAffectedByEffect(tp,CARD_BLUEEYES_SPIRIT) and Duel.GetLocationCount(tp,LOCATION_MZONE)>=3
		and Duel.IsPlayerCanSpecialSummonMonster(tp,TOKEN_FRACCION,0,TYPES_TOKEN,500,500,1,RACE_AQUA,ATTRIBUTE_WATER) then
		for i=1,3 do
			local token=Duel.CreateToken(tp,TOKEN_FRACCION)
			Duel.SpecialSummonStep(token,0,tp,tp,false,false,POS_FACEUP)
		end
		Duel.SpecialSummonComplete()
	end
	--Le reste de ce tour : pas d'Invocation Spéciale depuis l'Extra Deck, sauf des monstres Démon
	local e1=Effect.CreateEffect(e:GetHandler())
	e1:SetDescription(aux.Stringid(id,1))
	e1:SetType(EFFECT_TYPE_FIELD)
	e1:SetProperty(EFFECT_FLAG_PLAYER_TARGET+EFFECT_FLAG_CLIENT_HINT)
	e1:SetCode(EFFECT_CANNOT_SPECIAL_SUMMON)
	e1:SetTargetRange(1,0)
	e1:SetTarget(function(e,c) return c:IsLocation(LOCATION_EXTRA) and not c:IsRace(RACE_FIEND) end)
	e1:SetReset(RESET_PHASE|PHASE_END)
	Duel.RegisterEffect(e1,tp)
	aux.addTempLizardCheck(e:GetHandler(),tp,function(e,c) return not c:IsOriginalRace(RACE_FIEND) end)
end
function s.ayfilter(c,e,tp,g)
	return c:IsCode(CARD_AYON) and c:IsCanBeSpecialSummoned(e,0,tp,false,false) and Duel.GetLocationCountFromEx(tp,tp,g,c)>0
end
function s.aycost(e,tp,eg,ep,ev,re,r,rp,chk)
	local c=e:GetHandler()
	local tk=Duel.GetMatchingGroup(function(tc) return tc:IsCode(TOKEN_FRACCION) and tc:IsReleasable() end,tp,LOCATION_MZONE,0,nil)
	if chk==0 then return c:IsReleasable() and #tk>=3 and Duel.IsExistingMatchingCard(s.ayfilter,tp,LOCATION_EXTRA,0,1,nil,e,tp,tk+c) end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_RELEASE)
	local g=tk:Select(tp,3,3,nil)
	g:AddCard(c)
	Duel.Release(g,REASON_COST)
end
function s.aytg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,1,tp,LOCATION_EXTRA)
end
function s.ayop(e,tp,eg,ep,ev,re,r,rp)
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
	local tc=Duel.SelectMatchingCard(tp,s.ayfilter,tp,LOCATION_EXTRA,0,1,1,nil,e,tp,nil):GetFirst()
	if tc and Duel.SpecialSummon(tc,0,tp,tp,false,false,POS_FACEUP)>0 then
		tc:CompleteProcedure()
	end
end
