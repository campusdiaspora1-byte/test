--Barragán Luisenbarn - Le Second Espada
--Hueco Mundo (fan-made)
local s,id=GetID()
local SET_ESPADA,CARD_ARROGANTE=0xf70,711000015
function s.initial_effect(c)
	--Invocation par Sacrifice en Sacrifiant 1 seul monstre « Espada » que vous contrôlez
	aux.AddNormalSummonProcedure(c,true,true,1,1,SUMMON_TYPE_TRIBUTE,aux.Stringid(id,0),function(c,tp) return c:IsSetCard(SET_ESPADA) and c:IsControler(tp) end)
	--… ou 1 monstre adverse dont l'ATK est inférieure à son ATK d'origine
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetType(EFFECT_TYPE_SINGLE)
	e1:SetCode(EFFECT_SUMMON_PROC)
	e1:SetProperty(EFFECT_FLAG_CANNOT_DISABLE+EFFECT_FLAG_UNCOPYABLE)
	e1:SetCondition(s.otcon)
	e1:SetTarget(s.ottg)
	e1:SetOperation(s.otop)
	e1:SetValue(SUMMON_TYPE_TRIBUTE)
	c:RegisterEffect(e1)
	--(Effet Rapide) : envoyer cette carte et 1 autre Démon (main/Terrain) au Cimetière ; Invoquer par Fusion Arrogante
	local e2=Effect.CreateEffect(c)
	e2:SetDescription(aux.Stringid(id,1))
	e2:SetCategory(CATEGORY_SPECIAL_SUMMON+CATEGORY_FUSION_SUMMON)
	e2:SetType(EFFECT_TYPE_QUICK_O)
	e2:SetCode(EVENT_FREE_CHAIN)
	e2:SetRange(LOCATION_HAND|LOCATION_MZONE)
	e2:SetHintTiming(0,TIMINGS_CHECK_MONSTER_E)
	e2:SetCountLimit(1,id)
	e2:SetCost(s.fuscost)
	e2:SetTarget(s.fustg)
	e2:SetOperation(s.fusop)
	c:RegisterEffect(e2)
end
s.listed_series={SET_ESPADA}
s.listed_names={CARD_ARROGANTE}
s.material_setcode={SET_ESPADA}
function s.otfilter(c)
	return c:IsFaceup() and c:IsAttackBelow(c:GetBaseAttack()-1) and c:IsReleasable()
end
function s.otcon(e,c,minc)
	if c==nil then return true end
	local tp=c:GetControler()
	return minc<=1 and Duel.GetLocationCount(tp,LOCATION_MZONE)>0 and Duel.IsExistingMatchingCard(s.otfilter,tp,0,LOCATION_MZONE,1,nil)
end
function s.ottg(e,tp,eg,ep,ev,re,r,rp,chk,c)
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_RELEASE)
	local g=Duel.SelectMatchingCard(tp,s.otfilter,tp,0,LOCATION_MZONE,1,1,nil)
	if g and #g>0 then
		g:KeepAlive()
		e:SetLabelObject(g)
		return true
	end
	return false
end
function s.otop(e,tp,eg,ep,ev,re,r,rp,c)
	local g=e:GetLabelObject()
	if not g then return end
	c:SetMaterial(g)
	Duel.Release(g,REASON_SUMMON|REASON_MATERIAL)
	g:DeleteGroup()
end
-- Matériels : cette carte + 1 autre Démon, depuis la main ou le Terrain
function s.matfilter(c)
	return c:IsRace(RACE_FIEND) and c:IsMonster() and c:IsAbleToGraveAsCost() and (c:IsLocation(LOCATION_HAND) or c:IsFaceup())
end
function s.fusfilter(c,e,tp,mg)
	return c:IsCode(CARD_ARROGANTE) and c:IsCanBeSpecialSummoned(e,SUMMON_TYPE_FUSION,tp,false,false) and Duel.GetLocationCountFromEx(tp,tp,mg,c)>0
end
function s.othercheck(oc,c,e,tp)
	return Duel.IsExistingMatchingCard(s.fusfilter,tp,LOCATION_EXTRA,0,1,nil,e,tp,Group.FromCards(c,oc))
end
function s.fuscost(e,tp,eg,ep,ev,re,r,rp,chk)
	local c=e:GetHandler()
	if chk==0 then return c:IsAbleToGraveAsCost() and Duel.IsExistingMatchingCard(s.matfilter,tp,LOCATION_HAND|LOCATION_MZONE,0,1,c)
		and Duel.IsExistingMatchingCard(function(oc) return s.matfilter(oc) and s.othercheck(oc,c,e,tp) end,tp,LOCATION_HAND|LOCATION_MZONE,0,1,c) end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_TOGRAVE)
	local oc=Duel.SelectMatchingCard(tp,function(oc) return s.matfilter(oc) and s.othercheck(oc,c,e,tp) end,tp,LOCATION_HAND|LOCATION_MZONE,0,1,1,c):GetFirst()
	local mg=Group.FromCards(c,oc)
	mg:KeepAlive()
	e:SetLabelObject(mg)
	Duel.SendtoGrave(mg,REASON_COST|REASON_MATERIAL|REASON_FUSION)
end
function s.fustg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	Duel.SetOperationInfo(0,CATEGORY_SPECIAL_SUMMON,nil,1,tp,LOCATION_EXTRA)
end
function s.fusop(e,tp,eg,ep,ev,re,r,rp)
	local mg=e:GetLabelObject()
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
	local tc=Duel.SelectMatchingCard(tp,s.fusfilter,tp,LOCATION_EXTRA,0,1,1,nil,e,tp,nil):GetFirst()
	if tc then
		if mg then tc:SetMaterial(mg) end
		if Duel.SpecialSummon(tc,SUMMON_TYPE_FUSION,tp,tp,false,false,POS_FACEUP)>0 then
			tc:CompleteProcedure()
		end
	end
	if mg then mg:DeleteGroup() end
end
