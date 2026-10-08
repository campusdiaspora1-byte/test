--Coyote Starrk - Le Premier Espada
--Hueco Mundo (fan-made)
local s,id=GetID()
local SET_ESPADA,CARD_LILYNETTE=0xf70,711000013
function s.initial_effect(c)
	--Invoquée Normalement ou Spécialement : Invoquer Spécialement 1 « Lilynette Gingerbuck »
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetCategory(CATEGORY_SPECIAL_SUMMON)
	e1:SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)
	e1:SetProperty(EFFECT_FLAG_DELAY)
	e1:SetCode(EVENT_SUMMON_SUCCESS)
	e1:SetCountLimit(1,id)
	e1:SetTarget(s.sptg)
	e1:SetOperation(s.spop)
	c:RegisterEffect(e1)
	local e2=e1:Clone()
	e2:SetCode(EVENT_SPSUMMON_SUCCESS)
	c:RegisterEffect(e2)
	--Une fois par tour, pendant la Main Phase (Effet Rapide) : Niveau des « Espada » +1 ou −1
	local e3=Effect.CreateEffect(c)
	e3:SetDescription(aux.Stringid(id,1))
	e3:SetCategory(CATEGORY_LVCHANGE)
	e3:SetType(EFFECT_TYPE_QUICK_O)
	e3:SetCode(EVENT_FREE_CHAIN)
	e3:SetRange(LOCATION_MZONE)
	e3:SetHintTiming(0,TIMING_MAIN_END)
	e3:SetCountLimit(1)
	e3:SetCondition(function() return Duel.IsMainPhase() end)
	e3:SetTarget(s.lvtg)
	e3:SetOperation(s.lvop)
	c:RegisterEffect(e3)
end
s.listed_names={CARD_LILYNETTE}
s.listed_series={SET_ESPADA}
function s.spfilter(c,e,tp)
	return c:IsCode(CARD_LILYNETTE) and c:IsCanBeSpecialSummoned(e,0,tp,false,false)
end
function s.sptg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return Duel.GetLocationCount(tp,LOCATION_MZONE)>0
		and Duel.IsExistingMatchingCard(s.spfilter,tp,LOCATION_HAND|LOCATION_DECK|LOCATION_GRAVE,0,1,nil,e,tp) end
	Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,1,tp,LOCATION_HAND|LOCATION_DECK|LOCATION_GRAVE)
end
function s.spop(e,tp,eg,ep,ev,re,r,rp)
	if Duel.GetLocationCount(tp,LOCATION_MZONE)<=0 then return end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
	local g=Duel.SelectMatchingCard(tp,aux.NecroValleyFilter(s.spfilter),tp,LOCATION_HAND|LOCATION_DECK|LOCATION_GRAVE,0,1,1,nil,e,tp)
	if #g>0 then
		Duel.SpecialSummon(g,0,tp,tp,false,false,POS_FACEUP)
	end
end
function s.lvfilter(c)
	return c:IsFaceup() and c:IsSetCard(SET_ESPADA) and c:HasLevel()
end
function s.lvtg(e,tp,eg,ep,ev,re,r,rp,chk)
	local g=Duel.GetMatchingGroup(s.lvfilter,tp,LOCATION_MZONE,0,nil)
	if chk==0 then return #g>0 end
	local canlow=g:IsExists(Card.IsLevelAbove,1,nil,2)
	e:SetLabel(Duel.SelectEffect(tp,{true,aux.Stringid(id,2)},{canlow,aux.Stringid(id,3)}))
end
function s.lvop(e,tp,eg,ep,ev,re,r,rp)
	local amt=e:GetLabel()==1 and 1 or -1
	for tc in Duel.GetMatchingGroup(s.lvfilter,tp,LOCATION_MZONE,0,nil):Iter() do
		tc:UpdateLevel(amt,RESETS_STANDARD_PHASE_END,e:GetHandler())
	end
end
