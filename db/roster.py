r"""
The cast: who exists in the demo database, and why each one is here.
===================================================================
Split out of build_db.py so the roster (this file) and the machinery that writes
it (build_db.py) can be read separately.

SHAPE OF THE POPULATION
-----------------------
A real UPI network is not one person and their payees. It is mostly strangers:
people who transact with merchants and with their own small circle, and who never
touch you. So the roster is built as CLUSTERS, and the history generator only
draws edges that a real relationship would explain:

  om / family / flat / office / college   — Om's actual circle (he pays these)
  strangers                               — ordinary people, no edge to Om at all
  merchant_big / merchant_local           — where most real UPI volume goes
  mule_*                                  — a layered mule network (see below)
  scam_*                                  — the brand-name social-engineering scams
  new_genuine                             — fresh + honest: the false-positive cost

MULE NETWORK — WHY IT LOOKS LIKE THIS
-------------------------------------
Grounded in the tiering every source describes (FATF professional-ML report; RBI
MuleHunter.AI, which scores 19 distinct mule behaviours; I4C's 2.47M Layer-1 mule
accounts; 524,121 flagged in March 2026 alone) and in ALL_SCENARIOS.txt's own
8 canonical AML motifs (IBM AMLworld / NeurIPS 2023):

  victims -> L1 COLLECTOR -> L2 HOP -> AGGREGATOR -> CASH-OUT
                  \                                      /
                   `------------- HERDER (commission) --'

  motif coverage: FAN-IN (victims->collector), STACK (the tiers), GATHER-SCATTER
  (collector), SCATTER-GATHER (smurf split then re-aggregate), FAN-OUT (herder),
  CYCLE, BIPARTITE (victims vs mules), RANDOM (background).

Four mule TYPES, because "mule = fresh account" is wrong and the roster should
prove it rather than flatter the engine:

  witting     — rented their account for a cut. Fresh, BASIC KYC. Engine CATCHES.
  dormant     — old account kept quiet on purpose, then switched on. age ~1000d,
                so `receiver_account_age_days < 7` never fires. Engine MISSES.
  compromised — a real person's account, taken over. Looks like its owner.
  unwitting   — a scam victim forwarding money believing a cover story. Normal age,
                VIDEO KYC, real history. Nothing static flags them.

Two deliberate landmines aimed at OUR OWN rules:
  * mule_dormant_* are old  -> the age rule is blind to them.
  * mule_merchant_* have is_merchant=1 -> ml/rules.py exempts merchants from the
    fan-in rule, so a merchant-disguised mule walks straight through. This is not
    hypothetical: UPI *merchant* accounts were 11% of flagged suspicious VPA
    activity, funnelled through payment aggregators as fake commerce.
  Do not "fix" these into obvious scams. They are the honest tier.

Handles skew to payments banks (paytm / ybl) for the mule layer on purpose:
payments banks carried ~41% of suspicious VPA activity.

SHARED DEVICE / PHONE (mule farms)
----------------------------------
SIGNALS_MASTER.md F7/F8: many accounts on ONE device or ONE number = mule farm.
Farm members below deliberately share a `device` value, so
`shared_device_mule_cluster_size` has something real to find. Nothing in the
engine reads it yet — the data is here first, the signal can follow.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Each entry: vpa, name, cluster, age_days, kyc, balance, avg_amount, mcc,
#             blacklisted, device, phone, note
# device=None  -> gets its own unique fingerprint (normal person)
# device="..." -> SHARED with everyone else carrying that value (mule farm)
# ---------------------------------------------------------------------------
Account = dict


def _a(vpa, name, cluster, age, kyc, balance, avg, *, mcc=0, blacklisted=0,
       device=None, phone=None, note="") -> Account:
    return dict(vpa=vpa, name=name, cluster=cluster, age=age, kyc=kyc,
                balance=float(balance), avg=float(avg), mcc=mcc,
                blacklisted=blacklisted, device=device, phone=phone, note=note)


ROSTER: list[Account] = [
    # ======================================================= OM
    _a("omsawant@okicici", "Om Sawant", "om", 400, "VIDEO", 85000, 2000,
       phone="9137883718", note="the account you log in as"),

    # ======================================================= FAMILY
    _a("sunita.sawant@oksbi", "Sunita Sawant", "family", 1400, "VIDEO", 62000, 1500,
       phone="9820113345", note="Aai"),
    _a("prakash.sawant@okhdfc", "Prakash Sawant", "family", 1600, "VIDEO", 148000, 3000,
       phone="9820224456", note="Baba"),
    _a("sanika.sawant@ybl", "Sanika Sawant", "family", 900, "VIDEO", 24000, 800,
       phone="9820335567", note="sister, hostel"),

    # ======================================================= FLAT
    _a("rohit.patil@okaxis", "Rohit Patil", "flat", 1100, "VIDEO", 31000, 1200,
       phone="9820446678", note="roommate — splits rent with Om"),
    _a("landlord.gokhale@oksbi", "Vasant Gokhale", "flat", 2200, "VIDEO", 410000, 16000,
       phone="9820557789", note="landlord — rent on the 2nd, same amount monthly"),
    _a("meera.deshpande@okicici", "Meera Deshpande", "flat", 1350, "VIDEO", 54000, 900,
       phone="9820668890", note="neighbour, 4B"),
    _a("kiran.shetty@paytm", "Kiran Shetty", "flat", 780, "VIDEO", 19000, 700,
       phone="9820779901", note="neighbour, 2A"),
    _a("society.watchman@ybl", "Ganesh Jadhav", "flat", 600, "BASIC", 8000, 400,
       phone="9820880012", note="society watchman — small, regular receipts"),

    # ======================================================= OFFICE
    # The employer is is_merchant=1 so sender_is_corporate=1 -> payroll fan-out is
    # exempted from the velocity/fan-out rules. That exemption needs a real payer
    # to be worth anything.
    _a("infinitesoft.payroll@okhdfc", "Infinite Soft Pvt Ltd", "employer", 2600, "CORPORATE",
       4200000, 52000, mcc=7372, phone="8020113345",
       note="employer — salary to every office account on the 1st"),
    _a("aditya.kulkarni@okicici", "Aditya Kulkarni", "office", 750, "VIDEO", 57000, 2200,
       phone="9821113345", note="colleague"),
    _a("nilesh.bhosale@oksbi", "Nilesh Bhosale", "office", 980, "VIDEO", 71000, 2400,
       phone="9821224456", note="colleague"),
    _a("farhan.qureshi@okaxis", "Farhan Qureshi", "office", 1240, "VIDEO", 88000, 2600,
       phone="9821335567", note="colleague"),
    _a("divya.menon@ybl", "Divya Menon", "office", 660, "VIDEO", 46000, 1900,
       phone="9821446678", note="colleague"),
    _a("sarita.pawar@okhdfc", "Sarita Pawar", "office", 1520, "VIDEO", 96000, 2800,
       phone="9821557789", note="team lead"),

    # ======================================================= COLLEGE
    _a("sneha.joshi@paytm", "Sneha Joshi", "college", 1250, "VIDEO", 43000, 1000,
       phone="9822113345", note="college friend"),
    _a("tejas.more@ybl", "Tejas More", "college", 1180, "VIDEO", 27000, 900,
       phone="9822224456", note="college friend"),
    _a("ankita.rane@okicici", "Ankita Rane", "college", 1300, "VIDEO", 38000, 1100,
       phone="9822335567", note="college friend"),
    _a("vikrant.salvi@okaxis", "Vikrant Salvi", "college", 1090, "VIDEO", 22000, 850,
       phone="9822446678", note="college friend"),

    # ======================================================= STRANGERS
    # No edge to Om, ever. They pay merchants and their own circle. This is what
    # most of a real network looks like — and some of them become mule victims.
    _a("harish.iyer@oksbi", "Harish Iyer", "stranger", 1600, "VIDEO", 74000, 1400, phone="9701113345"),
    _a("bhavna.rathod@ybl", "Bhavna Rathod", "stranger", 890, "VIDEO", 33000, 1100, phone="9701224456"),
    _a("suresh.tambe@okpnb", "Suresh Tambe", "stranger", 2100, "VIDEO", 118000, 2100, phone="9701335567"),
    _a("lata.kamble@paytm", "Lata Kamble", "stranger", 540, "BASIC", 16000, 600, phone="9701446678"),
    _a("javed.ansari@okaxis", "Javed Ansari", "stranger", 1750, "VIDEO", 67000, 1500, phone="9701557789"),
    _a("pallavi.nene@okicici", "Pallavi Nene", "stranger", 1420, "VIDEO", 91000, 1800, phone="9701668890"),
    _a("dinkar.gaikwad@oksbi", "Dinkar Gaikwad", "stranger", 2300, "VIDEO", 143000, 2200, phone="9701779901"),
    _a("ruchi.agrawal@okhdfc", "Ruchi Agrawal", "stranger", 760, "VIDEO", 29000, 950, phone="9701880012"),
    _a("mohan.pillai@ybl", "Mohan Pillai", "stranger", 1930, "VIDEO", 82000, 1600, phone="9701991123"),
    _a("zoya.mirza@paytm", "Zoya Mirza", "stranger", 620, "BASIC", 21000, 700, phone="9702002234"),
    _a("arun.chavan@okpnb", "Arun Chavan", "stranger", 1150, "VIDEO", 48000, 1300, phone="9702113345"),
    _a("neelam.sood@okaxis", "Neelam Sood", "stranger", 1680, "VIDEO", 103000, 1900, phone="9702224456"),

    # ======================================================= MERCHANTS (big)
    _a("zomato@okkotak", "Zomato", "merchant_big", 2100, "CORPORATE", 1120000, 400,
       mcc=5814, phone="8020224456", note="food delivery"),
    _a("swiggy@okhdfc", "Swiggy", "merchant_big", 2000, "CORPORATE", 980000, 400,
       mcc=5814, phone="8020335567", note="food delivery"),
    _a("dmart@okaxis", "DMart", "merchant_big", 2400, "CORPORATE", 2300000, 900,
       mcc=5411, phone="8020446678", note="grocery"),
    _a("croma@okicici", "Croma", "merchant_big", 1900, "CORPORATE", 2070000, 4500,
       mcc=5732, phone="8020557789", note="electronics — rare, big-ticket"),
    _a("irctc@oksbi", "IRCTC", "merchant_big", 2500, "CORPORATE", 1650000, 1200,
       mcc=4112, phone="8020668890",
       note="BRAND word in the VPA + is_merchant=1 -> name_vpa_mismatch must NOT fire"),
    _a("apollopharmacy@okpnb", "Apollo Pharmacy", "merchant_big", 1700, "CORPORATE", 640000, 700,
       mcc=8062, phone="8020779901", note="pharmacy"),
    _a("jiorecharge@ybl", "Jio Recharge", "merchant_big", 2200, "CORPORATE", 890000, 300,
       mcc=4814, phone="8020880012", note="recharge"),

    # ======================================================= MERCHANTS (local)
    # Where the everyday volume actually is: small, frequent, boring.
    _a("shreekrishna.kirana@ybl", "Shree Krishna Kirana", "merchant_local", 1450, "CORPORATE", 210000, 320,
       mcc=5411, phone="8021113345", note="kirana shop"),
    _a("annapurna.chai@paytm", "Annapurna Tea Stall", "merchant_local", 900, "CORPORATE", 34000, 30,
       mcc=5812, phone="8021224456", note="chai — ₹10-40, many times a day"),
    _a("sai.autorickshaw@ybl", "Sai Auto Service", "merchant_local", 1120, "CORPORATE", 47000, 90,
       mcc=4121, phone="8021335567", note="auto rides"),
    _a("glamour.salon@okaxis", "Glamour Salon", "merchant_local", 1330, "CORPORATE", 88000, 350,
       mcc=7230, phone="8021446678", note="salon"),
    _a("wellness.medical@okhdfc", "Wellness Medical", "merchant_local", 1610, "CORPORATE", 156000, 260,
       mcc=8062, phone="8021557789", note="chemist"),

    # ======================================================= MULE — RING A (witting)
    # Telegram-recruited, account rented for a cut. Fresh + BASIC + payments-bank
    # handles. This is the tier the engine actually catches.
    _a("cash.quick777@paytm", "Ramesh Kumar", "mule_l1", 3, "BASIC", 300, 1000,
       blacklisted=1, device="farm_dev_A", phone="7020113345",
       note="L1 collector — victims pay here directly (FAN-IN). Blacklisted."),
    _a("fastpay.win21@ybl", "Sunil Yadav", "mule_l1", 5, "BASIC", 1200, 900,
       device="farm_dev_A", phone="7020224456",
       note="L1 collector — shares farm_dev_A with the ring (F7 device cluster)"),
    _a("instant.cash90@paytm", "Manoj Tiwari", "mule_l1", 4, "BASIC", 950, 800,
       device="farm_dev_A", phone="7020335567", note="L1 collector"),
    _a("easy.money55@ybl", "Preeti Sahu", "mule_l1", 6, "BASIC", 700, 700,
       device="farm_dev_A", phone="7020446678", note="L1 collector"),
    _a("quickwin.pay8@paytm", "Ajay Nagar", "mule_l1", 2, "BASIC", 450, 600,
       device="farm_dev_A", phone="7020557789", note="L1 collector"),

    _a("transfer.hub2@ybl", "Vikas Meena", "mule_l2", 9, "BASIC", 2100, 3000,
       device="farm_dev_B", phone="7020668890",
       note="L2 hop — layering tier, amount ~conserved minus commission"),
    _a("route.pay44@paytm", "Deepa Rana", "mule_l2", 11, "BASIC", 1800, 3000,
       device="farm_dev_B", phone="7020779901", note="L2 hop"),
    _a("relay.fast9@ybl", "Imran Shaikh", "mule_l2", 8, "BASIC", 3300, 3000,
       device="farm_dev_B", phone="7020880012", note="L2 hop"),

    _a("consolidate.acc1@okpnb", "Naveen Das", "mule_aggregator", 16, "BASIC", 8600, 12000,
       phone="7020991123", note="AGGREGATOR — many L2 hops gather here (GATHER)"),
    _a("finalcash.out@paytm", "Dinesh Rawat", "mule_cashout", 12, "BASIC", 800, 15000,
       blacklisted=1, phone="7021002234",
       note="CASH-OUT — ATM draw, holding time <60s (ALL_SCENARIOS CASE 26). Blacklisted."),
    _a("controller.ops@ybl", "unknown", "mule_herder", 22, "BASIC", 46000, 5000,
       phone="7021113345", note="HERDER — takes a commission from every mule (FAN-OUT source)"),

    # ======================================================= MULE — RING B (dormant farm)
    # THE LANDMINE: old accounts, deliberately kept quiet, then switched on.
    # `receiver_account_age_days < 7` is blind to these. Shared device = F7.
    _a("sushil.mane@oksbi", "Sushil Mane", "mule_dormant", 1180, "VIDEO", 2400, 400,
       device="farm_dev_C", phone="7021224456",
       note="DORMANT mule — 1180d old, near-zero history, suddenly active. Age rule MISSES."),
    _a("rekha.bhatt@okpnb", "Rekha Bhatt", "mule_dormant", 1460, "VIDEO", 1900, 400,
       device="farm_dev_C", phone="7021335567", note="DORMANT mule — shares farm_dev_C"),
    _a("gopal.varma@okaxis", "Gopal Varma", "mule_dormant", 970, "VIDEO", 3100, 400,
       device="farm_dev_C", phone="7021446678", note="DORMANT mule — shares farm_dev_C"),

    # ======================================================= MULE — RING C (merchant-disguised)
    # THE OTHER LANDMINE: is_merchant=1, so ml/rules.py exempts them from the fan-in
    # rule entirely. UPI merchant accounts were 11% of flagged suspicious VPA activity.
    _a("sunrise.traders@okaxis", "Sunrise Traders", "mule_merchant", 240, "CORPORATE", 62000, 2500,
       mcc=5399, phone="8022113345",
       note="merchant-disguised mule — fake commerce via a payment aggregator. "
            "is_merchant=1 -> our fan-in rule EXEMPTS it. Engine MISSES."),
    _a("global.enterprise@okhdfc", "Global Enterprise", "mule_merchant", 180, "CORPORATE", 41000, 2500,
       mcc=5399, phone="8022224456", note="merchant-disguised mule — same exemption hole"),

    # ======================================================= MULE — RING D (unwitting)
    # Real people, real history, being used. Nothing static flags them — that is the
    # point (FRAUD_CATALOG.md HARD tier).
    _a("nandini.kaul@okicici", "Nandini Kaul", "mule_unwitting", 1290, "VIDEO", 37000, 1200,
       phone="7021557789",
       note="UNWITTING mule — romance-scam victim forwarding money, believes the cover story"),
    _a("prakash.jhaveri@oksbi", "Prakash Jhaveri", "mule_unwitting", 1710, "VIDEO", 58000, 1500,
       phone="7021668890",
       note="UNWITTING mule — 'work from home, process payments' job scam"),

    # ======================================================= SCAMS (brand-name social engineering)
    # Caught by name_vpa_mismatch (BRAND word + is_merchant=0) and/or fresh age.
    _a("amazon.refund99@ybl", "Vikas Meena", "scam_brand", 4, "BASIC", 2100, 800,
       phone="7022113345", note="#16 refund scam — 'amazon'+'refund' -> mismatch"),
    _a("phonepe.care.help@okaxis", "Deepa Rana", "scam_brand", 6, "BASIC", 1800, 700,
       phone="7022224456", note="#17 fake customer care — 'care'+'help' -> mismatch"),
    _a("sbi.kyc.update@okpnb", "Manoj Tiwari", "scam_brand", 2, "BASIC", 950, 600,
       phone="7022335567", note="fake KYC — 'sbi.'+'kyc'+'update' -> mismatch"),
    _a("bigbazaar.pay@okaxis", "Imran Shaikh", "scam_brand", 9, "BASIC", 4200, 1500,
       phone="7022446678", note="#18 merchant VPA spoof — 'bigbazaar' on a personal account"),
    _a("electric.cycle.shop@okhdfc", "Naveen Das", "scam_brand", 5, "BASIC", 3300, 1200,
       phone="7022557789", note="#22b fake e-commerce — 'shop' on a PERSONAL account"),
    _a("taskearn.support@ybl", "Preeti Sahu", "scam_brand", 3, "BASIC", 700, 500,
       phone="7022668890", note="#20 job/task scam — 'support' -> mismatch"),
    _a("bigwin.lottery.help@paytm", "Ajay Nagar", "scam_brand", 2, "BASIC", 450, 500,
       phone="7022779901", note="#29 lottery advance-fee — 'help' -> mismatch, 'lottery' -> precheck"),
    _a("instaloan.care@paytm", "Rekha Bhatt", "scam_brand", 8, "BASIC", 2600, 900,
       phone="7022880012", note="#26 loan-app extortion — 'care' -> mismatch"),

    # ======================================================= SCAMS (the HARD tier)
    # No brand word, no blacklist, ordinary-looking. FRAUD_CATALOG.md says these are
    # not catchable at payment time, and ALL_SCENARIOS CASE 10 says so in capitals.
    _a("wealthgrow.invest@okicici", "Sameer Khanna", "scam_hard", 6, "BASIC", 15000, 5000,
       phone="7023113345", note="#24 investment / pig-butchering — HARD: only 'fresh + BASIC' fires"),
    _a("cyber.cell.verify@oksbi", "R. Sharma", "scam_hard", 4, "BASIC", 6400, 2000,
       phone="7023224456", note="#28 digital arrest — HARD: 'verify' hits /precheck only, not rules"),

    # ======================================================= NEW BUT GENUINE
    # Fresh and honest. Here so the precision cost is visible instead of hidden.
    _a("nikhil.newshop@okhdfc", "Nikhil Traders", "new_genuine", 4, "CORPORATE", 12000, 600,
       mcc=5411, phone="9930113345", note="genuine NEW merchant — fresh but real"),
    _a("pooja.rane@ybl", "Pooja Rane", "new_genuine", 3, "VIDEO", 8500, 900,
       phone="9930224456", note="genuine NEW friend — fresh but real"),
]

# Clusters that are merchants for is_merchant / MCC purposes.
MERCHANT_CLUSTERS = {"merchant_big", "merchant_local", "employer", "mule_merchant"}


def is_merchant(a: Account) -> int:
    return 1 if (a["cluster"] in MERCHANT_CLUSTERS or (a["cluster"] == "new_genuine" and a["mcc"])) else 0


def by_cluster(*clusters: str) -> list[Account]:
    want = set(clusters)
    return [a for a in ROSTER if a["cluster"] in want]


def one(vpa: str) -> Account:
    for a in ROSTER:
        if a["vpa"] == vpa:
            return a
    raise KeyError(vpa)
