"""
VDOT Adopt-a-Highway local coordinator lookup.

Maps a county/jurisdiction name (as returned by the VDOT/VGIN ArcGIS layers,
e.g. FROM_JURISDICTION_NM on the LRS_Edge_Rte_Overlap layer, or JURISDICTION
on the Adopt-a-Highway permits layer) to the VDOT residency office and AAH
coordinator email that would normally receive the application.

Source: https://www.virginiadot.org/programs/prog-aah-coords.asp (fetched
2026-09-16). This is informational only — actual delivery of applications
submitted through this site currently goes to a fixed address while the
feature is being piloted (see lambda_vdot_submit.py), but the resolved
coordinator is included in the email body so a human can forward/verify.
"""

# Maps a lowercased county/city name -> (residency name, coordinator email, phone)
_COORDINATORS = {
    'abingdon': ('Abingdon', 'aah-abingdon@vdot.virginia.gov', '276-676-5503'),
    'accomac': ('Accomac', 'aah-accomac@vdot.virginia.gov', '757-787-5856'),
    'appomattox_residency': ('Appomattox', 'aah-appomattox@vdot.virginia.gov', '434-352-7135'),
    'ashland': ('Ashland', 'aah-ashland@vdot.virginia.gov', '804-585-3564'),
    'bedford_residency': ('Bedford', 'aah-bedford@vdot.virginia.gov', '540-586-7910'),
    'charlottesville': ('Charlottesville', 'aah-charlottesville@vdot.virginia.gov', '434-293-0011'),
    'chesterfield_residency': ('Chesterfield', 'aah-chesterfield@vdot.virginia.gov', '804-674-2800'),
    'christiansburg': ('Christiansburg', 'aah-christiansburg@vdot.virginia.gov', '540-381-7201'),
    'edinburg': ('Edinburg', 'aah-edinburg@vdot.virginia.gov', '540-984-5600'),
    'fairfax_residency': ('Fairfax', 'aah-fairfax@vdot.virginia.gov', '703-259-1786'),
    'farmville': ('Farmville', 'aah-farmville@vdot.virginia.gov', '434-505-3424'),
    'franklin_residency': ('Franklin', 'aah-franklin@vdot.virginia.gov', '757-346-3072'),
    'fredericksburg': ('Fredericksburg', 'aah-fredericksburg@vdot.virginia.gov', '540-899-4300'),
    'halifax_residency': ('Halifax', 'aah-halifax@vdot.virginia.gov', '434-476-6342'),
    'harrisonburg': ('Harrisonburg', 'aah-harrisonburg@vdot.virginia.gov', '540-434-2586'),
    'lebanon': ('Lebanon', 'aah-lebanon@vdot.virginia.gov', '276-889-7600'),
    'lexington_residency': ('Lexington', 'aah-lexington@vdot.virginia.gov', '540-463-3108'),
    'loudoun_residency': ('Loudoun', 'aah-loudoun@vdot.virginia.gov', '703-737-2000'),
    'louisa_residency': ('Louisa', 'aah-louisa@vdot.virginia.gov', '540-967-3710'),
    'martinsville': ('Martinsville', 'aah-martinsville@vdot.virginia.gov', '276-629-2581'),
    'norfolk': ('Norfolk', 'aah-norfolk@vdot.virginia.gov', ''),
    'northern_neck': ('Northern Neck', 'aah-northernneck@vdot.virginia.gov', '804-333-3696'),
    'petersburg': ('Petersburg', 'aah-petersburg@vdot.virginia.gov', '804-863-4000'),
    'prince_william_residency': ('Prince William', 'aah-princewilliam@vdot.virginia.gov', '703-366-1924'),
    'salem': ('Salem', 'aah-salem@vdot.virginia.gov', '540-387-5488'),
    'saluda': ('Saluda', 'aah-saluda@vdot.virginia.gov', '804-758-2321'),
    'southhill': ('South Hill', 'aah-southhill@vdot.virginia.gov', '434-774-2300'),
    'warrenton': ('Warrenton', 'aah-warrenton@vdot.virginia.gov', '540-347-6441'),
    'williamsburg': ('Williamsburg', 'aah-williamsburg@vdot.virginia.gov', '757-253-5138'),
    'wise_residency': ('Wise', 'aah-wise@vdot.virginia.gov', '276-328-9331'),
    'wytheville': ('Wytheville', 'aah-wytheville@vdot.virginia.gov', '276-228-2153'),
}

# Maps a normalized county/city name -> residency key above.
_COUNTY_TO_RESIDENCY = {
    'smyth': 'abingdon', 'washington': 'abingdon',
    'accomack': 'accomac', 'northampton': 'accomac',
    'amherst': 'appomattox_residency', 'appomattox': 'appomattox_residency',
    'campbell': 'appomattox_residency', 'nelson': 'appomattox_residency',
    'charles city': 'ashland', 'goochland': 'ashland', 'hanover': 'ashland',
    'henrico': 'ashland', 'new kent': 'ashland',
    'bedford': 'bedford_residency', 'franklin': 'franklin_residency',
    'albemarle': 'charlottesville', 'greene': 'charlottesville', 'madison': 'charlottesville',
    'amelia': 'chesterfield_residency', 'chesterfield': 'chesterfield_residency', 'powhatan': 'chesterfield_residency',
    'floyd': 'christiansburg', 'giles': 'christiansburg', 'montgomery': 'christiansburg', 'pulaski': 'christiansburg',
    'clarke': 'edinburg', 'frederick': 'edinburg', 'shenandoah': 'edinburg', 'warren': 'edinburg',
    'arlington': 'fairfax_residency', 'fairfax': 'fairfax_residency',
    'buckingham': 'farmville', 'charlotte': 'farmville', 'cumberland': 'farmville', 'prince edward': 'farmville',
    'greensville': 'franklin_residency', 'isle of wight': 'franklin_residency', 'isle of wright': 'franklin_residency',
    'southampton': 'franklin_residency', 'sussex': 'franklin_residency',
    'caroline': 'fredericksburg', 'spotsylvania': 'fredericksburg', 'stafford': 'fredericksburg',
    'halifax': 'halifax_residency', 'pittsylvania': 'halifax_residency',
    'page': 'harrisonburg', 'rockingham': 'harrisonburg', 'augusta': 'harrisonburg',
    'buchanan': 'lebanon', 'russell': 'lebanon', 'tazewell': 'lebanon',
    'alleghany': 'lexington_residency', 'bath': 'lexington_residency', 'highland': 'lexington_residency',
    'loudoun': 'loudoun_residency',
    'fluvanna': 'louisa_residency', 'louisa': 'louisa_residency', 'orange': 'louisa_residency',
    'henry': 'martinsville', 'patrick': 'martinsville', 'carroll': 'martinsville',
    'hampton': 'norfolk',
    'king george': 'northern_neck', 'lancaster': 'northern_neck', 'northumberland': 'northern_neck',
    'richmond county': 'northern_neck', 'westmoreland': 'northern_neck',
    'dinwiddie': 'petersburg', 'nottoway': 'petersburg', 'prince george': 'petersburg',
    'prince william': 'prince_william_residency',
    'botetourt': 'salem', 'craig': 'salem', 'roanoke': 'salem',
    'essex': 'saluda', 'gloucester': 'saluda', 'king and queen': 'saluda', 'king william': 'saluda',
    'mathews': 'saluda', 'middlesex': 'saluda',
    'brunswick': 'southhill', 'lunenburg': 'southhill', 'mecklenburg': 'southhill',
    'culpeper': 'warrenton', 'fauquier': 'warrenton', 'rappahannock': 'warrenton',
    'james city': 'williamsburg', 'surry': 'williamsburg', 'york': 'williamsburg',
    'dickenson': 'wise_residency', 'lee': 'wise_residency', 'scott': 'wise_residency', 'wise': 'wise_residency',
    'bland': 'wytheville', 'grayson': 'wytheville', 'wythe': 'wytheville',
}


def _normalize(name):
    if not name:
        return ''
    name = name.strip().lower()
    for suffix in (' county', ' city'):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return name.strip()


def get_coordinator(jurisdiction_name):
    """Look up the VDOT AAH residency coordinator for a county/city name.

    Returns a dict with residency/email/phone, or None if no match is found
    (e.g. an independent city that maintains its own roads and isn't part of
    a VDOT residency's county list).
    """
    key = _normalize(jurisdiction_name)
    residency_key = _COUNTY_TO_RESIDENCY.get(key)
    if not residency_key:
        return None
    residency, email, phone = _COORDINATORS[residency_key]
    return {'residency': residency, 'email': email, 'phone': phone}
