--Compatibilité : le cœur d'ocgcore-wasm est un peu plus ancien que les scripts de ProjectIgnis/CardScripts.
--Certains champs récents de Duel.GetChainInfo (archétypes, valeur Lien, échelles Pendule de la carte qui active)
--y provoquent l'erreur « Passed invalid CHAININFO flag », qui interrompt l'enregistrement des effets (Kuriboh…).
--On les calcule ici à partir de la carte qui a activé l'effet.
local core_GetChainInfo=Duel.GetChainInfo
local fallback={
	[CHAININFO_TRIGGERING_SETCODES or 30]=function(c) return {c:GetSetCard()} end,
	[CHAININFO_TRIGGERING_LINK or 31]=function(c) return c:GetLink() end,
	[CHAININFO_TRIGGERING_LSCALE or 32]=function(c) return c:GetLeftScale() end,
	[CHAININFO_TRIGGERING_RSCALE or 33]=function(c) return c:GetRightScale() end,
}
local function one(ch,flag)
	local ok,v=pcall(core_GetChainInfo,ch,flag)
	if ok then return v end
	local f=fallback[flag]
	if not f then return nil end
	local ok2,e=pcall(core_GetChainInfo,ch,CHAININFO_TRIGGERING_EFFECT)
	if not ok2 or not e then return nil end
	return f(e:GetHandler())
end
function Duel.GetChainInfo(ch,...)
	local flags={...}
	local ok,a,b,c,d,e,f,g,h=pcall(core_GetChainInfo,ch,...)
	if ok then return a,b,c,d,e,f,g,h end
	local out={}
	for i,flag in ipairs(flags) do out[i]=one(ch,flag) end
	return table.unpack(out,1,#flags)
end
